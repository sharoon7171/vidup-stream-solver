import { Buffer } from 'node:buffer'
import { ORIGIN, USER_AGENT } from '../cfg/constants.js'

const PROXY_PATH = '/api/hls'
const UPSTREAM_HEADERS = { Referer: `${ORIGIN}/`, Origin: ORIGIN, 'User-Agent': USER_AGENT }

function stripSegmentWrapper(buf) {
  if (buf.length < 4 || buf[0] === 0x47) return buf
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return buf
  const iend = buf.indexOf(Buffer.from('IEND'))
  if (iend >= 0 && iend + 8 < buf.length) return buf.subarray(iend + 8)
  for (let i = 0; i < Math.min(buf.length, 65536); i++) {
    if (buf[i] === 0x47 && i + 188 < buf.length && buf[i + 188] === 0x47) return buf.subarray(i)
  }
  return buf
}

function rewritePlaylist(text, baseUrl) {
  return text.split('\n').map((line) => {
    const trimmed = line.trim()
    return !trimmed || trimmed.startsWith('#') ? line : `${PROXY_PATH}?url=${encodeURIComponent(new URL(trimmed, baseUrl).href)}`
  }).join('\n')
}

export async function proxyHls(targetUrl) {
  const res = await fetch(targetUrl, { headers: UPSTREAM_HEADERS, redirect: 'follow' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`upstream ${res.status}${body ? `: ${body.slice(0, 80)}` : ''}`)
  }
  const contentType = res.headers.get('content-type') || ''
  const pathname = new URL(targetUrl).pathname.toLowerCase()
  if (contentType.includes('mpegurl') || contentType.includes('m3u8') || pathname.endsWith('.m3u8')) {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' },
      body: rewritePlaylist(await res.text(), targetUrl),
    }
  }
  return {
    status: 200,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' },
    body: stripSegmentWrapper(Buffer.from(await res.arrayBuffer())),
  }
}
