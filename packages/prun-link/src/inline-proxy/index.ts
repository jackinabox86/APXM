/**
 * Cross-browser synchronous WebSocket proxy via inline script injection.
 *
 * Inserts a plain-JavaScript WebSocket proxy as an inline <script> element
 * at document_start, before any page scripts run. The proxy captures frames
 * and forwards raw data to the content script via window.postMessage, where
 * the TypeScript pipeline decodes them.
 *
 * Using a plain JS constructor (rather than exportFunction or a Proxy wrapper)
 * is essential for compatibility with extensions like refined-prun that wrap
 * window.WebSocket with `new Proxy(..., { construct(t, a) { Reflect.construct(t, a) } })`.
 * exportFunction-wrapped functions are not proper constructors and cause
 * Reflect.construct to fail silently in that chain.
 */

/** postMessage channel for raw WebSocket frame forwarding. */
export const RAW_FRAME_CHANNEL = '__apxmRawFrame';

/** Main-world flag set once the inline proxy is installed. */
const INSTALLED_FLAG = '__apxmWsProxied';

function isDebug(): boolean {
  return __DEV__ || location.search.includes('apxm_debug');
}

/**
 * Build the inline script text. Uses a string literal so the code runs in the
 * page's main world (no TypeScript module imports available there). The channel
 * constant is baked in at build time.
 */
function buildInlineScript(): string {
  return `(function(){
'use strict';
if(window.__apxmWsProxied)return;
var _NWS=window.WebSocket;
var _CH='${RAW_FRAME_CHANNEL}';
function _sz(d){return typeof d==='string'?d.length:(d&&d.byteLength||0);}
function _inst(ws){
ws.addEventListener('message',function(e){
try{window.postMessage({ch:_CH,d:e.data,dir:'i',sz:_sz(e.data)},'*')}catch(_){}
});
var _ns=ws.send.bind(ws);
ws.send=function(data){
try{window.postMessage({ch:_CH,d:data,dir:'o',sz:_sz(data)},'*')}catch(_){}
return _ns(data);
};
}
function WebSocketProxy(){
var ws=new _NWS(...arguments);
_inst(ws);
return ws;
}
WebSocketProxy.prototype=_NWS.prototype;
WebSocketProxy.CONNECTING=_NWS.CONNECTING;
WebSocketProxy.OPEN=_NWS.OPEN;
WebSocketProxy.CLOSING=_NWS.CLOSING;
WebSocketProxy.CLOSED=_NWS.CLOSED;
window.__apxmWsProxied=true;
window.WebSocket=WebSocketProxy;
})();`;
}

/**
 * Install a WebSocket proxy synchronously in the main world via an inline
 * <script> element.
 *
 * The proxy captures every WebSocket frame and forwards raw data to the
 * content script via window.postMessage on the RAW_FRAME_CHANNEL. The
 * content script decodes frames using the @prun/link TypeScript pipeline.
 *
 * Returns true if the proxy was successfully installed (confirmed by checking
 * the __apxmWsProxied flag after script execution). Returns false if inline
 * scripts are blocked by CSP or the API is unavailable — in that case the
 * caller should fall back to ws-interceptor.js.
 */
export function installInlineProxy(): boolean {
  try {
    if ((window as Record<string, unknown>)[INSTALLED_FLAG]) return true;

    const script = document.createElement('script');
    script.textContent = buildInlineScript();
    // Inline scripts execute synchronously when appended; remove immediately
    // after execution so the element doesn't linger in the DOM.
    document.documentElement.appendChild(script);
    script.remove();

    const installed = !!(window as Record<string, unknown>)[INSTALLED_FLAG];

    if (isDebug()) {
      if (installed) {
        console.log(`[APXM:inline-proxy] installed @${performance.now().toFixed(1)}ms`);
      } else {
        console.warn('[APXM:inline-proxy] failed to install (CSP blocked inline script?)');
      }
    }

    return installed;
  } catch {
    return false;
  }
}
