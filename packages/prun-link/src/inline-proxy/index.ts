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

/** Main-world flag (window property) — visible only from main world. */
const INSTALLED_FLAG = '__apxmWsProxied';
/** DOM attribute flag — shared between main world and content-script world. */
const DOM_ATTR = 'apxmProxy';

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
function _preview(d){return typeof d==='string'?JSON.stringify(d.slice(0,16)):'[binary '+_sz(d)+'b]';}
var _sn=0,_rn=0;
function _inst(ws){
console.log('[APXM:proxy] WS created url='+ws.url+' @'+performance.now().toFixed(1)+'ms');
ws.addEventListener('message',function(e){
_rn++;
if(_rn<=10)console.log('[APXM:proxy] recv#'+_rn+' '+_preview(e.data));
try{
window.postMessage({ch:_CH,d:e.data,dir:'i',sz:_sz(e.data)},'*');
}catch(pmErr){console.error('[APXM:proxy] recv postMessage failed:',pmErr);}
});
var _ns=ws.send.bind(ws);
ws.send=function(data){
_sn++;
if(_sn<=30)console.log('[APXM:proxy] send#'+_sn+' '+_preview(data));
var r;
try{r=_ns(data);}
catch(sendErr){console.error('[APXM:proxy] native send#'+_sn+' FAILED:',sendErr);return;}
try{
window.postMessage({ch:_CH,d:data,dir:'o',sz:_sz(data)},'*');
}catch(pmErr){console.error('[APXM:proxy] send postMessage failed:',pmErr);}
return r;
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
document.documentElement.dataset.${DOM_ATTR}='1';
window.WebSocket=WebSocketProxy;
console.log('[APXM:proxy] main-world installed @'+performance.now().toFixed(1)+'ms');
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
    // Use a DOM attribute as the readiness signal — DOM is shared between the
    // main world and the content-script isolated world, unlike window properties
    // which are namespaced per world (so window.__apxmWsProxied set by the
    // inline script is invisible here).
    if (document.documentElement.dataset[DOM_ATTR]) return true;

    const script = document.createElement('script');
    script.textContent = buildInlineScript();
    // Inline scripts execute synchronously when appended; remove immediately
    // after execution so the element doesn't linger in the DOM.
    document.documentElement.appendChild(script);
    script.remove();

    // The inline script sets document.documentElement.dataset[DOM_ATTR] = '1'
    // synchronously, so this is readable immediately after the append.
    const installed = !!document.documentElement.dataset[DOM_ATTR];

    if (installed) {
      console.log(`[APXM:proxy] content-script confirmed via DOM attr @${performance.now().toFixed(1)}ms`);
    } else {
      console.warn('[APXM:proxy] inline proxy FAILED — inline scripts blocked by CSP; falling back to ws-interceptor.js');
    }

    return installed;
  } catch {
    return false;
  }
}
