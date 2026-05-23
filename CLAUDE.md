# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**APXM** is a cross-browser extension providing a mobile-optimised touch interface and desktop Empire HUD for [Prosperous Universe](https://prosperousuniverse.com). It observes WebSocket traffic between APEX and the game server, decodes game messages, and renders rich UIs via React.

**Key Goal**: Port action runner features from [refined-prun](https://github.com/refined-prun/refined-prun) desktop extension to work on mobile via Orion browser. Desktop and mobile share the same compiled bundle—CSS hashes are identical across platforms.

**Platform Support**: iOS/iPadOS (Orion), Android (Firefox/Kiwi), Desktop (Chrome/Firefox with HUD overlay)

## Commands

```bash
# Install dependencies (Node.js 22+, pnpm 10+)
pnpm install

# Development
pnpm run dev              # Chrome with hot reload
pnpm run dev:firefox      # Firefox with hot reload

# Build
pnpm run build            # Chrome MV3 → .output/chrome-mv3/
pnpm run build:firefox    # Firefox MV2 → .output/firefox-mv2/

# Testing
pnpm test                 # Run all tests (Vitest)
pnpm test -- pattern      # Run matching tests (e.g., pnpm test -- burn)
pnpm test --run           # Single run (no watch)

# Packaging
pnpm run zip              # Chrome zip
pnpm run zip:firefox      # Firefox zip + sources (for AMO)

# Desktop shell (separate Vite app at apxm.27bit.dev)
cd shell && pnpm install && pnpm run build
```

## Key Constraint: Message Batching

The content script (`entrypoints/content.tsx`) implements **two-layer message batching** to prevent React 19 error #185 (max update depth). During login, dozens of messages arrive rapidly:

1. **setTimeout(0)** — collects messages into fresh macro tasks (React's nestedUpdateCount resets)
2. **Entity store shadow batching** — redirects mutations to plain Maps during batch, then flushes with one Zustand `set()` call per store

This prevents React from hitting 50 nested updates. Without this, login would crash. Any new message handler must work within the existing batch pipeline in content.tsx — do not dispatch store updates outside of it.

## Mobile-Specific Constraints

- **Single buffer**: Mobile APEX has one active buffer at a time. Buffer refresh must navigate in/out for each step (serial, not parallel).
- **Stack navigation**: UI uses hierarchical stacks, not floating windows.
- **#container div**: All mobile game UI lives here; APXM overlay manipulates display/margin/height to avoid covering game controls.
- **Touch-first**: Tailwind mobile-first layout; pointer events tuned for touch.
- **Form interaction requires on-screen buffer**: WebKit blocks focus and keyboard events on `visibility:hidden` or `left:-9999px` elements. Any action step driving an APEX form (typing, clicking) must restore `#container` to `visibility:visible; left:0px` for the duration. See `docs/mobile-integration.md` for the full pattern.

## CSS & Styling

- **Tailwind CSS** — Mobile-first (small screens default, then @media breakpoints)
- **PostCSS** — rem-to-px conversion for Orion compatibility
- **Shadow DOM** — React mounts in `apxm-overlay` shadow host; scoped styles prevent APEX conflicts. CSS hashes are identical across desktop and mobile builds (verified).

## Task-Specific Docs

Run `find docs/ -name "*.md" | sort` to see available docs. Read based on task:

| Task | Read |
|------|------|
| Adding/modifying UI components | `docs/components.md` |
| Adding stores or message handlers | `docs/stores.md` |
| Working with material identifiers (ticker / name / display name) | `docs/stores.md` |
| Writing or fixing tests | `docs/testing.md` |
| Action runner / mobile DOM interaction | `docs/mobile-integration.md` |
| Debugging WebSocket bridge or coexistence with refined-prun | `docs/architecture.md` |

## Dependencies

- **@prun/link** — In-repo workspace package (`packages/prun-link/`) for WebSocket interception + decoding
- **React 19** + TypeScript
- **Zustand** — State management
- **Tailwind CSS** — Utility styling
- **Vitest** — Unit testing
- **WXT** — Cross-browser extension framework (Vite-based)
- **Helm** — Desktop galaxy map (pixi.js)
