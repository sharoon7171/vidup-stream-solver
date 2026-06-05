import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStreamRequest } from '../stream/path.js'
import { proxyHls } from '../hls/proxy.js'
import { decodeServer, resolveStream, resolveStreamLive } from '../stream/resolve.js'

const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/index.html')

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname === '/api/hls') {
      const target = url.searchParams.get('url')
      if (!target) return sendJson(res, 400, { error: 'url required' })
      try {
        const proxied = await proxyHls(target)
        res.writeHead(proxied.status, proxied.headers)
        res.end(proxied.body)
      } catch (err) {
        console.error('[hls]', target.slice(0, 80), err.message)
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end('upstream error')
      }
      return
    }
    if (url.pathname === '/api/server') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' })
      const payload = await (async () => {
        let body = ''
        for await (const chunk of req) body += chunk
        return JSON.parse(body)
      })().catch(() => null)
      if (!payload?.contentPath || !payload?.data) return sendJson(res, 400, { error: 'contentPath and data required' })
      return sendJson(res, 200, await decodeServer(payload.contentPath, payload.data, payload))
    }
    if (url.pathname === '/api/stream/live') {
      const parsed = parseStreamRequest(url.searchParams)
      if (parsed.error) return sendJson(res, 400, { error: parsed.error })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      const push = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      try {
        await resolveStreamLive(parsed, { server: url.searchParams.get('server') }, push)
      } catch (err) {
        push('fail', { ok: false, error: String(err.message || err) })
      }
      res.end()
      return
    }
    if (url.pathname === '/api/stream') {
      const parsed = parseStreamRequest(url.searchParams)
      if (parsed.error) return sendJson(res, 400, { error: parsed.error })
      return sendJson(res, 200, await resolveStream(parsed, { server: url.searchParams.get('server') }))
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      fs.createReadStream(indexPath).pipe(res)
      return
    }
    res.writeHead(404)
    res.end('not found')
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err.message || err) })
  }
}
