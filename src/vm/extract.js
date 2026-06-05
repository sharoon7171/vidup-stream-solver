const patch = (code) => code
  .replace(/n\(5376\)\.Buffer/g, 'Buffer')
  .replace(/n\(3018\)/g, 'crypto')
  .replace(/n\(7358\)/g, '({})')
  .replace(/var a5=n\(7358\),a9=n\(5376\)\.Buffer/, 'var a5=({}),a9=Buffer')
  .replace(/var a1=n\(3018\),a2=n\(5376\)\.Buffer/, 'var a1=__crypto,a2=__Buffer')
  .replace(/var a5=\(\{\}\),a9=Buffer/, 'var a5=({}),a9=__Buffer')
  .replace(/a2\.from\([^)]+\);/, '')

const SHIM = `
function oe(t){return __decodeString(t)}
const a6=oe,a8=oe
let a7=typeof globalThis!=="undefined"?globalThis:global
let ot=a7.vm_0x44eebd_96c17e||(a7.vm_0x44eebd_96c17e={})
`

const stripReactBootstrap = (code) => {
  const a = code.indexOf('ot[a6(247)]=g'), b = code.indexOf('ot.crypto=a1')
  return a >= 0 && b > a ? code.slice(0, a) + code.slice(b) : code
}

const bootstrap = (src, cryptoEnd, vmStart) => {
  const gap = src.slice(cryptoEnd, vmStart)
  const marker = 'ot[a6(964)]=o_'
  const i = gap.indexOf(marker)
  if (i < 0) throw new Error(`missing ${marker} before VM`)
  return stripReactBootstrap(gap.slice(i))
}

export function extractVmSlice(source) {
  const cryptoStart = source.indexOf('var a1=n(3018)'), cryptoEnd = source.indexOf('let a6=oe,a8=oe'), vmStart = source.indexOf('var ou=function')
  const endMarker = 'ot[a6(997)]=oj'
  const vmEnd = source.indexOf(endMarker, source.indexOf('async function oP')) + endMarker.length
  if ([cryptoStart, cryptoEnd, vmStart, vmEnd].some((v) => v < 0) || cryptoEnd < cryptoStart || vmEnd < vmStart) throw new Error('VM region not found in chunk 294')
  return `${patch(source.slice(cryptoStart, cryptoEnd))}\n${SHIM}\n${patch(bootstrap(source, cryptoEnd, vmStart))}\n${patch(source.slice(vmStart, vmEnd))}`
}

export const VM_BROWSER_SHIMS = `
globalThis.Worker = class Worker {
  constructor() { this.onmessage = null }
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.MessageChannel = class MessageChannel {
  constructor() {
    this.port1 = { postMessage() {}, start() {}, addEventListener() {} }
    this.port2 = { postMessage() {}, start() {}, addEventListener() {} }
  }
}
globalThis.BroadcastChannel = class BroadcastChannel {
  postMessage() {}
  close() {}
  addEventListener() {}
}
globalThis.parent = globalThis
globalThis.top = globalThis
globalThis.postMessage = function () {}
if (!globalThis.crypto.randomBytes) {
  const baseCrypto = globalThis.crypto
  globalThis.crypto = Object.assign(Object.create(Object.getPrototypeOf(baseCrypto)), baseCrypto, {
    randomBytes(n) {
      const a = new Uint8Array(n)
      baseCrypto.getRandomValues(a)
      return typeof Buffer !== 'undefined' ? Buffer.from(a) : a
    },
  })
}
`

export const VM_PRELUDE = `function on(){return!1}function o_(){return!1}function oR(){return!0}function oW(){return!1}
${VM_BROWSER_SHIMS}`

export const VM_RUNNER = `
async function __runServers(EN){
  var servers=[], tU=EN, t6="";
  var od=function(v){servers=v}, ek=function(){}, or=function(){};
  try {
    await oz({crypto:__crypto,encode:a4,en:tU,server:t6,setServers:od,setState:ek,setFavServer:or,window:globalThis,document:globalThis.document,navigator:globalThis.navigator,localStorage:globalThis.localStorage,console:globalThis.console,JSON:JSON,Math:Math,Date:Date,RegExp:RegExp,Map:Map,Set:Set,WeakMap:WeakMap,WeakSet:WeakSet,Array:Array,Object:Object,Number:Number,String:String,Boolean:Boolean,Symbol:Symbol,Function:Function,screen:globalThis.screen,Error:Error,TypeError:TypeError,RangeError:RangeError,SyntaxError:SyntaxError,parseInt:parseInt,parseFloat:parseFloat,isNaN:isNaN,isFinite:isFinite,encodeURIComponent:encodeURIComponent,decodeURIComponent:decodeURIComponent,NaN:NaN,Infinity:1/0,undefined:void 0,Promise:Promise,Proxy:Proxy,Reflect:Reflect,Uint8Array:Uint8Array,Int8Array:Int8Array,Uint16Array:Uint16Array,Int16Array:Int16Array,Uint32Array:Uint32Array,Int32Array:Int32Array,Float32Array:Float32Array,Float64Array:Float64Array,BigInt:BigInt,fetch:fetch,TextEncoder:TextEncoder,TextDecoder:TextDecoder,URL:URL,URLSearchParams:URLSearchParams,AbortSignal:AbortSignal,AbortController:AbortController,Buffer:__Buffer,atob:atob,btoa:btoa}, function(){});
  } catch (err) {
    throw new Error('oz: ' + (err && (err.stack || err.message) || err));
  }
  return servers;
}
async function __runDecode(RS){
  var l=[];
  await oP({dr:l,rs:RS,crypto:__crypto,window:globalThis,document:globalThis.document,navigator:globalThis.navigator,localStorage:globalThis.localStorage,console:globalThis.console,JSON:JSON,Math:Math,Date:Date,RegExp:RegExp,Map:Map,Set:Set,WeakMap:WeakMap,WeakSet:WeakSet,Array:Array,Object:Object,Number:Number,String:String,Boolean:Boolean,Symbol:Symbol,Function:Function,screen:globalThis.screen,Error:Error,TypeError:TypeError,RangeError:RangeError,SyntaxError:SyntaxError,parseInt:parseInt,parseFloat:parseFloat,isNaN:isNaN,isFinite:isFinite,encodeURIComponent:encodeURIComponent,decodeURIComponent:decodeURIComponent,NaN:NaN,Infinity:1/0,undefined:void 0,Promise:Promise,Proxy:Proxy,Reflect:Reflect,Uint8Array:Uint8Array,Int8Array:Int8Array,Uint16Array:Uint16Array,Int16Array:Int16Array,Uint32Array:Uint32Array,Int32Array:Int32Array,Float32Array:Float32Array,Float64Array:Float64Array,BigInt:BigInt,fetch:fetch,TextEncoder:TextEncoder,TextDecoder:TextDecoder,URL:URL,URLSearchParams:URLSearchParams,AbortSignal:AbortSignal,AbortController:AbortController,Buffer:__Buffer,atob:atob,btoa:btoa});
  return l[0];
}
globalThis.__vidup = { runServers: __runServers, runDecode: __runDecode };
`
