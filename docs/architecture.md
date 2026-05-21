# Architecture: WebSocket Bridge & Extension Internals

This is foundational infrastructure. It works — don't touch it without understanding all of it.

## Data Pipeline

```
APEX ↔ Game Server (WebSocket/Socket.IO)
         ↓ (observed, never modified)
    ┌─── inline-proxy (inline <script>, main world, document_start) ────┐
    │    Captures WS frames via WebSocket.prototype.send + addEventListener│
    │    Posts raw frames via window.postMessage(__apxmRawFrame)          │
    │    content.tsx receives → decodeFrame() → dispatchMessage()         │
    └──────────────────────────────────────────────────────────────────────┘
    ┌─── ws-interceptor.js (main-world injected script) ──────────────────┐
    │    WS proxy: skipped when inline proxy active (__apxmWsProxied)     │
    │    XHR proxy: always installed (polling transport fallback)          │
    │    When WS proxy runs: ProcessedMessage → emitMessage →             │
    │      BRIDGE_CHANNEL postMessage → initMessageBridge → onMessage     │
    └──────────────────────────────────────────────────────────────────────┘
         ↓
    Zustand entity stores
         ↓
    ├─→ Mobile UI (React overlay, full-screen)
    └─→ Desktop bridge (postMessage → Helm HUD)
```

## Extension Entrypoints

- **content.tsx** — Main bootstrap script (document_start). Synchronously installs the inline WebSocket proxy via `installInlineProxy()`, then injects ws-interceptor.js, polls for interceptor readiness, initializes message bridge and Zustand stores, mounts React overlay in Shadow DOM or runs desktop bridge mode. Hosts the raw-frame bridge: receives `__apxmRawFrame` postMessages from the inline proxy, decodes them with `decodeFrame()`, and dispatches directly to `onMessage` subscribers via `dispatchMessage()`.
- **ws-interceptor.ts** — Main-world script injected by content.tsx. Skips WebSocket proxy installation when the inline proxy is already active (`window.__apxmWsProxied`); always installs the XHR proxy for polling-transport fallback. When the WebSocket proxy does run (inline proxy failed), processes frames through the full @prun/link decoder pipeline.
- **background.ts** — Minimal service worker for extension lifecycle (MV3).

## `@prun/link` Package (`packages/prun-link/`)

In-repo pnpm workspace package (`"@prun/link": "workspace:*"`). No build step — WXT/Vite compiles its `.ts` source directly.

- **`inline-proxy/`** — `installInlineProxy()` injects a plain-JS `<script>` element synchronously at document_start, installing a WebSocket proxy in the main world before any page scripts run. The proxy intercepts at `WebSocket.prototype.send` (bypasses refined-prun's Proxy `get` trap) and via a captured `addEventListener` reference (bypasses refined-prun's recursive `WebSocket.prototype.addEventListener` stub). Raw frames are forwarded to the content-script world via `window.postMessage` on `RAW_FRAME_CHANNEL`. Installation is confirmed via a DOM dataset attribute (`apxmProxy`) which is readable from both worlds — unlike `window.__apxmWsProxied` which is main-world-only.
- **`socket-io/`** — `installWebSocketProxy()` / `installXHRProxy()` observe APEX traffic without modifying it; `setMessageCallback()` registers the sink. Decodes engine.io v4 frames → Socket.IO v4 EVENT packets → `ProcessedMessage`. Also exports `decodeFrame()` for direct use by content.tsx's raw-frame bridge.
- **`script-control/`** — `installScriptBlocker()` / `restoreBlockedScripts()` hold back APEX's scripts until the proxies are installed.
- **`message-bus/`** — `emitMessage()` (main-world) and `initMessageBridge()` + `onMessage()` + `dispatchMessage()` (content-bridge) bridge messages across the world boundary. `initMessageBridge()` listens on the `BRIDGE_CHANNEL` postMessage channel (used by ws-interceptor.js). `dispatchMessage()` delivers a `ProcessedMessage` directly to all `onMessage` subscribers without going through postMessage — used by content.tsx's inline-proxy raw-frame bridge.

APEX wraps every game message in a Socket.IO event literally named `"event"`; the real `messageType` lives inside `args[0]` as `{ messageType, payload }`. That double-wrapped object becomes `ProcessedMessage.payload`, which `extractPayload()` (`stores/message-handlers.ts`) unwraps one level.

## refined-prun Coexistence Constraints

refined-prun's `socketIOMiddleware` wraps `window.WebSocket` with a `new Proxy(WebSocket, { construct })` and each instance with a second Proxy `{ get, set }`. Two specific behaviours require care:

**Instance Proxy `get` trap** returns `Reflect.get(nativeWs, prop).bind(nativeWs)` for all function properties. This means instance-level overrides (`ws.send = fn`) are silently bypassed — the trap performs a live prototype lookup and returns the prototype method bound to the native ws, ignoring any per-instance property. **Fix**: intercept at `WebSocket.prototype.send` instead.

**`WebSocket.prototype.addEventListener` overwrite**: after setting up the outer Proxy, refined-prun replaces `WebSocket.prototype.addEventListener` with a self-referential stub `function(t,l,o){ return this.addEventListener(t,l,o) }`. Calling this stub with a native (non-Proxy) WebSocket as `this` causes infinite recursion → stack overflow → the WebSocket constructor silently throws. **Fix**: capture `_origAEL = NativeWebSocket.prototype.addEventListener` before any other extension code can run (i.e., at inline-script init time) and call `_origAEL.call(ws, ...)` directly in `_inst()` rather than going through the prototype chain.

**Extension world isolation**: `window.__apxmWsProxied` set by the inline script (main world) is invisible from the content-script isolated world. Use `document.documentElement.dataset.apxmProxy` as the cross-world readiness signal instead — DOM attributes are shared between all worlds.

**Script-blocker interaction**: both APXM and refined-prun install MutationObserver-based script blockers at document_start. refined-prun's blocker re-catches scripts that APXM releases, so APEX's bundle load timing is non-deterministic when both are active. The inline proxy must be installed before either blocker releases the scripts, which the synchronous `installInlineProxy()` call in content.tsx (document_start, isolated world) guarantees.
