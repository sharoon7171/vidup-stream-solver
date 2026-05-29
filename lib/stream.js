import { Buffer } from 'node:buffer'
import { CSRF_HEADERS, ORIGIN, USER_AGENT } from './constants.js'
import { buildContentPath, buildStreamPath } from './content-path.js'
import { createVmRuntime } from './vm-engine.js'

const fail = (stage, error, extra = {}) => ({ ok: false, stage, error, ...extra })

function publicSource(decoded) {
  if (!decoded || typeof decoded === 'string') return undefined
  return {
    title: decoded.title,
    poster: decoded.poster,
    backdrop: decoded.backdrop,
    tmdbId: decoded.tmdbId,
    tracks: decoded.tracks,
    englishTrackIndex: decoded.englishTrackIndex,
    fourKAvailable: decoded['4kAvailable'],
  }
}

function publicServers(servers) {
  if (!servers?.length) return servers
  return servers.map((s) => ({
    name: s.name,
    description: s.description,
    image: s.image,
    data: s.data,
  }))
}

function publicResult(data) {
  if (!data.ok) {
    const out = { ok: false, stage: data.stage, error: data.error }
    if (data.type) out.type = data.type
    if (data.contentPath) out.contentPath = data.contentPath
    if (data.servers) out.servers = publicServers(data.servers)
    return out
  }
  const out = {
    ok: true,
    type: data.type,
    contentPath: data.contentPath,
    streamUrl: data.streamUrl,
  }
  if (data.selectedServer) out.selectedServer = data.selectedServer
  if (data.servers) out.servers = publicServers(data.servers)
  const source = publicSource(data.source)
  if (source) out.source = source
  return out
}

function postHeaders(base, contentPath) {
  return {
    ...CSRF_HEADERS,
    'User-Agent': USER_AGENT,
    Origin: base,
    Referer: `${base}${contentPath}`,
  }
}

function postUrl(base, serverData) {
  return `${base}/${buildStreamPath(String(serverData).replace(/^\//, ''))}`
}

function parsePageToken(html) {
  const en =
    html.match(/\\"en\\":\\"([^\\"]+)\\"/)?.[1] ??
    html.match(/"en":"([^"]+)"/)?.[1] ??
    html.match(/"en":\\"([^\\"]+)\\"/)?.[1]
  const host =
    html.match(/\\"host\\":\\"([^\\"]+)\\"/)?.[1] ?? html.match(/"host":"([^"]+)"/)?.[1]
  const id = html.match(/\\"id\\":\\"(\d+)\\"/)?.[1] ?? html.match(/"id":"(\d+)"/)?.[1]
  return { en, host, id }
}

function pickServer(servers, options = {}) {
  if (options.server != null && options.server !== '') {
    const raw = String(options.server)
    const asIndex = Number(raw)
    if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < servers.length) {
      return { server: servers[asIndex], index: asIndex }
    }
    const byName = servers.findIndex((s) => s.name.toLowerCase() === raw.toLowerCase())
    if (byName >= 0) return { server: servers[byName], index: byName }
  }
  const index = servers.findIndex((s) => s.name !== 'Mega')
  return index >= 0 ? { server: servers[index], index } : { server: servers[0], index: 0 }
}

function contentPathOf(request) {
  if (typeof request === 'string') return request
  return request.contentPath || buildContentPath(request)
}

async function loadVm(base, contentPath, extra = {}) {
  try {
    return { vm: createVmRuntime({ Buffer, origin: base, contentPath }) }
  } catch (err) {
    return fail('vm-load', String(err.message || err), extra)
  }
}

async function postStream(base, contentPath, serverData) {
  return fetch(postUrl(base, serverData), {
    method: 'POST',
    headers: postHeaders(base, contentPath),
  })
}

export async function decodeServerStream(contentPath, serverData, options = {}) {
  const base = options.origin || ORIGIN
  const type = options.type || 'movie'

  let vm = options.vm
  if (!vm) {
    const loaded = await loadVm(base, contentPath, { type, contentPath })
    if (!loaded.vm) return publicResult(loaded)
    vm = loaded.vm
  }

  let responseText
  try {
    const res = await postStream(base, contentPath, serverData)
    responseText = await res.text()
    if (!res.ok) return publicResult(fail('post', `upstream ${res.status}`, { type, contentPath }))
  } catch (err) {
    return publicResult(fail('post', String(err.message || err), { type, contentPath }))
  }

  let decoded
  try {
    decoded = await vm.runDecode(responseText)
  } catch (err) {
    return publicResult(fail('decode', String(err.message || err), { type, contentPath }))
  }

  const streamUrl = typeof decoded === 'string' ? decoded : decoded?.url
  if (!streamUrl) return publicResult(fail('decode', 'decode returned empty url', { type, contentPath }))

  const selectedServer =
    options.serverIndex != null
      ? { index: options.serverIndex, name: options.serverName || 'stream' }
      : undefined

  return publicResult({ ok: true, type, contentPath, streamUrl, source: decoded, selectedServer })
}

export async function resolveStream(request, options = {}) {
  const base = options.origin || ORIGIN
  const contentPath = contentPathOf(request)
  const type = typeof request === 'object' ? request.type || 'movie' : 'movie'

  const pageRes = await fetch(`${base}${contentPath}`, { headers: { 'User-Agent': USER_AGENT } })
  const token = { pageUrl: `${base}${contentPath}`, contentPath, ...parsePageToken(await pageRes.text()) }
  if (!token.en) return publicResult(fail('page-token', 'en token missing', { type, contentPath }))

  const loaded = await loadVm(base, contentPath, { type, contentPath, token })
  if (!loaded.vm) return publicResult(loaded)
  const vm = loaded.vm

  let allServers
  try {
    allServers = await vm.runServers(token.en)
  } catch (err) {
    return publicResult(fail('servers', String(err.message || err), { type, contentPath }))
  }
  if (!allServers?.length) {
    return publicResult(fail('servers', 'no servers returned', { type, contentPath }))
  }

  const available = []
  let next = 0
  const workers = Math.min(options.concurrency ?? 8, allServers.length)
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < allServers.length) {
        const index = next++
        const server = allServers[index]
        if (!server?.data) continue
        try {
          const res = await postStream(base, contentPath, server.data)
          if (res.ok) available.push(server)
        } catch {}
      }
    }),
  )

  if (!available.length) {
    return publicResult(fail('probe', 'no available servers', { type, contentPath, servers: [] }))
  }

  const picked = pickServer(available, options)
  if (!picked.server?.data) {
    return publicResult(fail('servers', 'server entry missing data field', { type, contentPath, servers: available }))
  }

  const decoded = await decodeServerStream(contentPath, picked.server.data, {
    origin: base,
    type,
    serverName: picked.server.name,
    serverIndex: picked.index,
    vm,
  })
  if (!decoded.ok) return publicResult({ ...decoded, servers: available })

  return publicResult({
    ...decoded,
    servers: available,
    selectedServer: { index: picked.index, name: picked.server.name },
  })
}
