import { Buffer } from 'node:buffer'
import { CSRF_HEADERS, ORIGIN, USER_AGENT } from '../cfg/constants.js'
import { buildContentPath, buildStreamPath } from './path.js'
import { createVmRuntime } from '../vm/runtime.js'

const fail = (stage, error, extra = {}) => ({ ok: false, stage, error, ...extra })

function publicServers(servers) {
  return servers?.length ? servers.map((s) => ({ name: s.name, description: s.description, image: s.image, data: s.data })) : servers
}

function toResponse(data) {
  if (!data.ok) {
    const out = { ok: false, stage: data.stage, error: data.error }
    if (data.type) out.type = data.type
    if (data.contentPath) out.contentPath = data.contentPath
    if (data.servers) out.servers = publicServers(data.servers)
    return out
  }
  const out = { ok: true, type: data.type, contentPath: data.contentPath, streamUrl: data.streamUrl }
  if (data.selectedServer) out.selectedServer = data.selectedServer
  if (data.servers) out.servers = publicServers(data.servers)
  if (data.source && typeof data.source === 'object') {
    out.source = {
      title: data.source.title,
      poster: data.source.poster,
      backdrop: data.source.backdrop,
      tmdbId: data.source.tmdbId,
      tracks: data.source.tracks,
      englishTrackIndex: data.source.englishTrackIndex,
      fourKAvailable: data.source['4kAvailable'],
    }
  }
  return out
}

const postHeaders = (base, contentPath) => ({ ...CSRF_HEADERS, 'User-Agent': USER_AGENT, Origin: base, Referer: `${base}${contentPath}` })
const postUrl = (base, serverData) => `${base}/${buildStreamPath(String(serverData).replace(/^\//, ''))}`

const parsePageToken = (html) =>
  html.match(/\\"en\\":\\"([^\\"]+)\\"/)?.[1] ??
  html.match(/"en":"([^"]+)"/)?.[1] ??
  html.match(/"en":\\"([^\\"]+)\\"/)?.[1]

function pickServer(servers, options = {}) {
  if (options.server != null && options.server !== '') {
    const raw = String(options.server), index = Number(raw)
    if (Number.isInteger(index) && index >= 0 && index < servers.length) return { server: servers[index], index }
    const byName = servers.findIndex((s) => s.name.toLowerCase() === raw.toLowerCase())
    if (byName >= 0) return { server: servers[byName], index: byName }
  }
  const index = servers.findIndex((s) => s.name !== 'Mega')
  return index >= 0 ? { server: servers[index], index } : { server: servers[0], index: 0 }
}

async function loadVm(base, contentPath, extra) {
  try {
    return { vm: createVmRuntime({ Buffer, origin: base, contentPath }) }
  } catch (err) {
    return fail('vm-load', String(err.message || err), extra)
  }
}

async function postStream(base, contentPath, serverData) {
  return fetch(postUrl(base, serverData), { method: 'POST', headers: postHeaders(base, contentPath) })
}

export async function decodeServer(contentPath, serverData, options = {}) {
  const base = options.origin || ORIGIN, type = options.type || 'movie'
  let vm = options.vm
  if (!vm) {
    const loaded = await loadVm(base, contentPath, { type, contentPath })
    if (!loaded.vm) return toResponse(loaded)
    vm = loaded.vm
  }
  let responseText
  try {
    const res = await postStream(base, contentPath, serverData)
    responseText = await res.text()
    if (!res.ok) return toResponse(fail('post', `upstream ${res.status}`, { type, contentPath }))
  } catch (err) {
    return toResponse(fail('post', String(err.message || err), { type, contentPath }))
  }
  let decoded
  try {
    decoded = await vm.runDecode(responseText)
  } catch (err) {
    return toResponse(fail('decode', String(err.message || err), { type, contentPath }))
  }
  const streamUrl = typeof decoded === 'string' ? decoded : decoded?.url
  if (!streamUrl) return toResponse(fail('decode', 'decode returned empty url', { type, contentPath }))
  return toResponse({
    ok: true,
    type,
    contentPath,
    streamUrl,
    source: decoded,
    selectedServer: options.serverIndex != null ? { index: options.serverIndex, name: options.serverName || 'stream' } : undefined,
  })
}

export async function resolveStream(request, options = {}) {
  let result
  await resolveStreamLive(request, options, (event, data) => {
    if (event === 'ready') result = data
    if (event === 'fail' && !result) result = data
  })
  return result || toResponse(fail('probe', 'no playable stream', { contentPath: typeof request === 'string' ? request : request.contentPath || buildContentPath(request) }))
}

export async function resolveStreamLive(request, options, emit) {
  const base = options.origin || ORIGIN
  const contentPath = typeof request === 'string' ? request : request.contentPath || buildContentPath(request)
  const type = typeof request === 'object' ? request.type || 'movie' : 'movie'
  const meta = { type, contentPath }

  emit('status', { step: 1, text: 'Reading VidUP page…' })
  const pageToken = parsePageToken(await (await fetch(`${base}${contentPath}`, { headers: { 'User-Agent': USER_AGENT } })).text())
  if (!pageToken) {
    emit('fail', toResponse(fail('page-token', 'en token missing', meta)))
    return
  }

  emit('status', { step: 2, text: 'Loading decoder…' })
  const loaded = await loadVm(base, contentPath, meta)
  if (!loaded.vm) {
    emit('fail', toResponse(loaded))
    return
  }
  const vm = loaded.vm

  emit('status', { step: 3, text: 'Fetching stream hosts…' })
  let allServers
  try {
    allServers = await vm.runServers(pageToken)
  } catch (err) {
    emit('fail', toResponse(fail('servers', String(err.message || err), meta)))
    return
  }
  if (!allServers?.length) {
    emit('fail', toResponse(fail('servers', 'no servers returned', meta)))
    return
  }

  if (options.server != null && options.server !== '') {
    const picked = pickServer(allServers, options)
    if (picked.index > 0) {
      allServers = [picked.server, ...allServers.filter((_, i) => i !== picked.index)]
    }
  }

  emit('status', { step: 4, text: 'Probing servers in parallel…' })
  const available = []
  let next = 0
  let readySent = false
  const decodes = []
  const workers = Math.min(options.concurrency ?? 8, allServers.length)

  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < allServers.length) {
      const index = next++, server = allServers[index]
      if (!server?.data) continue
      try {
        if (!(await postStream(base, contentPath, server.data)).ok) continue
        available.push(server)
        emit('found', {
          index: available.length - 1,
          name: server.name,
          description: server.description,
          image: server.image,
          data: server.data,
          ...meta,
        })
        decodes.push((async () => {
          const decoded = await decodeServer(contentPath, server.data, {
            origin: base,
            type,
            serverName: server.name,
            serverIndex: available.length - 1,
            vm,
          })
          if (!decoded.ok || !decoded.streamUrl || readySent) return
          readySent = true
          emit('ready', { ...decoded, servers: publicServers(available), selectedServer: { index: available.length - 1, name: server.name } })
        })())
      } catch {}
    }
  }))

  await Promise.all(decodes)
  if (!readySent) {
    emit('fail', toResponse(fail('probe', 'no playable stream', { ...meta, servers: publicServers(available) })))
  }
  emit('done', { ...meta, servers: publicServers(available) })
}
