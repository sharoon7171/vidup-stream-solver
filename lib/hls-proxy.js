import { Buffer } from 'node:buffer'
import { ORIGIN, USER_AGENT } from './constants.js'

const PROXY = '/api/hls'
const UPSTREAM_HEADERS = {
  Referer: `${ORIGIN}/`,
  Origin: ORIGIN,
  'User-Agent': USER_AGENT,
}

function stripSegmentPayload(buf) {
  if (buf.length < 4) return buf
  if (buf[0] === 0x47) return buf
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return buf
  const marker = Buffer.from('IEND')
  const iend = buf.indexOf(marker)
  if (iend >= 0 && iend + 8 < buf.length) return buf.subarray(iend + 8)
  for (let i = 0; i < Math.min(buf.length, 65536); i++) {
    if (buf[i] === 0x47 && i + 188 < buf.length && buf[i + 188] === 0x47) return buf.subarray(i)
  }
  return buf
}

function rewriteM3u8(text, baseUrl) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return line
      return `${PROXY}?url=${encodeURIComponent(new URL(trimmed, baseUrl).href)}`
    })
    .join('\n')
}

async function fetchUpstream(url) {
  const res = await fetch(url, { headers: UPSTREAM_HEADERS, redirect: 'follow' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`upstream ${res.status}${body ? `: ${body.slice(0, 80)}` : ''}`)
  }
  return res
}

export async function proxyHlsRequest(targetUrl) {
  const res = await fetchUpstream(targetUrl)
  const type = res.headers.get('content-type') || ''
  const path = new URL(targetUrl).pathname.toLowerCase()
  const isPlaylist = type.includes('mpegurl') || type.includes('m3u8') || path.endsWith('.m3u8')
  if (isPlaylist) {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' },
      body: rewriteM3u8(await res.text(), targetUrl),
    }
  }
  return {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
    body: stripSegmentPayload(Buffer.from(await res.arrayBuffer())),
  }
}
