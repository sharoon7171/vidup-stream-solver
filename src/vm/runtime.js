import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORIGIN, USER_AGENT } from '../cfg/constants.js'
import { decodeString } from '../../vendor/extracts/decoder.js'
import { VM_PRELUDE, VM_RUNNER, extractVmSlice } from './extract.js'

const CHUNK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../vendor/chunks/294-c47766b073062ca6.js')

const createFetch = (origin, contentPath) => {
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

const createDocument = (origin, contentPath) => ({
  createElement: (tag) => ({ style: {}, setAttribute() {}, appendChild() {}, contentWindow: { postMessage() {} }, tagName: String(tag || '').toUpperCase() }),
  cookie: '',
  location: { href: `${origin}${contentPath}` },
})

export function createVmRuntime({ Buffer, origin = ORIGIN, contentPath = '/movie/0' } = {}) {
  const dbg = function debug() {}
  dbg.toString = () => 'function debug() { [native code] }'
  const sandbox = {
    Buffer,
    crypto,
    fetch: createFetch(origin, contentPath),
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    performance: { now: () => Date.now() },
    navigator: { userAgent: USER_AGENT, language: 'en-US', platform: 'MacIntel', hardwareConcurrency: 8, webdriver: false, maxTouchPoints: 0 },
    console: { ...console, debug: dbg },
    document: createDocument(origin, contentPath),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    screen: { width: 1920, height: 1080 },
    location: { hostname: 'vidup.to', host: 'vidup.to', origin, href: `${origin}${contentPath}`, pathname: contentPath, search: '', hash: '' },
  }
  sandbox.window = sandbox.globalThis = sandbox.self = sandbox.parent = sandbox.top = sandbox
  const fn = new Function(
    'globalThis', 'window', 'self', 'document', 'navigator', 'localStorage', 'screen', '__crypto', 'fetch', 'atob', 'btoa', '__Buffer', 'TextEncoder', 'TextDecoder', 'location', 'performance', '__decodeString',
    `${VM_PRELUDE}\n${extractVmSlice(fs.readFileSync(CHUNK_PATH, 'utf8'))}\n${VM_RUNNER}; return globalThis.__vidup;`,
  )
  return fn(sandbox, sandbox, sandbox, sandbox.document, sandbox.navigator, sandbox.localStorage, sandbox.screen, sandbox.crypto, sandbox.fetch, sandbox.atob, sandbox.btoa, sandbox.Buffer, sandbox.TextEncoder, sandbox.TextDecoder, sandbox.location, sandbox.performance, decodeString)
}
