import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGIN, USER_AGENT } from './constants.js'
import { decodeString } from './string-decoder.generated.js'
import { VM_PRELUDE, VM_RUNNER, extractVmSlice } from './chunk-patches.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHUNK_PATH = path.join(__dirname, '../assets/294-c47766b073062ca6.js')

function buildVmScript() {
  const chunk = fs.readFileSync(CHUNK_PATH, 'utf8')
  const slice = extractVmSlice(chunk)
  return `${VM_PRELUDE}\n${slice}\n${VM_RUNNER}`
}

function createFetch(origin, contentPath) {
  const baseFetch = globalThis.fetch
  return async (input, init = {}) => {
    let url = typeof input === 'string' ? input : input.url
    if (url.startsWith('/')) url = `${origin}${url}`
    const headers = new Headers(init.headers || {})
    if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT)
    if (!headers.has('Origin')) headers.set('Origin', origin)
    if (!headers.has('Referer')) headers.set('Referer', `${origin}${contentPath}`)
    return baseFetch(url, { ...init, headers })
  }
}

function createDocument(origin, contentPath) {
  return {
    createElement: (tag) => ({
      style: {},
      setAttribute() {},
      appendChild() {},
      contentWindow: { postMessage() {} },
      tagName: String(tag || '').toUpperCase(),
    }),
    cookie: '',
    location: { href: `${origin}${contentPath}` },
  }
}

export function createVmRuntime(env = {}) {
  const origin = env.origin || ORIGIN
  const contentPath = env.contentPath || '/movie/0'
  const dbg = function debug() {}
  dbg.toString = () => 'function debug() { [native code] }'
  const g = {
    Buffer: env.Buffer,
    crypto: env.crypto || crypto,
    fetch: env.fetch || createFetch(origin, contentPath),
    atob: env.atob || globalThis.atob,
    btoa: env.btoa || globalThis.btoa,
    TextEncoder: env.TextEncoder || globalThis.TextEncoder,
    TextDecoder: env.TextDecoder || globalThis.TextDecoder,
    performance: env.performance || { now: () => Date.now() },
    navigator: env.navigator || {
      userAgent: USER_AGENT,
      language: 'en-US',
      platform: 'MacIntel',
      hardwareConcurrency: 8,
      webdriver: false,
      maxTouchPoints: 0,
    },
    console: env.console || { ...console, debug: dbg },
    document: env.document || createDocument(origin, contentPath),
    localStorage: env.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    screen: env.screen || { width: 1920, height: 1080 },
    location: env.location || {
      hostname: 'vidup.to',
      host: 'vidup.to',
      origin,
      href: `${origin}${contentPath}`,
      pathname: contentPath,
      search: '',
      hash: '',
    },
  }
  g.window = g
  g.globalThis = g
  g.self = g
  g.parent = g
  g.top = g

  const body = buildVmScript() + '; return globalThis.__vidup;'
  const fn = new Function(
    'globalThis', 'window', 'self', 'document', 'navigator', 'localStorage', 'screen', '__crypto', 'fetch', 'atob', 'btoa', '__Buffer', 'TextEncoder', 'TextDecoder', 'location', 'performance', '__decodeString',
    body,
  )
  return fn(g, g, g, g.document, g.navigator, g.localStorage, g.screen, g.crypto, g.fetch, g.atob, g.btoa, g.Buffer, g.TextEncoder, g.TextDecoder, g.location, g.performance, decodeString)
}
