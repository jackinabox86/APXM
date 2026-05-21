# React Components (`components/`)

## Layout

- `App.tsx` — Root; toggles shadow host visibility, manages APEX overlay, handles #container offset
- `layout/AppShell.tsx` — Tab-based navigation (Status/Bases/Fleet/Contracts/Settings)
- `layout/TabBar.tsx` — Mobile tab switcher
- `layout/Header.tsx` — Title bar with connection status
- `layout/FloatingReturn.tsx` — Floating "Return to APEX" button

## Feature Views

- `views/StatusView.tsx` — Dashboard (mini lists for bases, fleet, contracts, cash)
- `views/BasesView.tsx` — Full base list with burn status, expandable detail
- `views/FleetView.tsx` — Ship list, cargo/fuel bars, ETA countdowns
- `views/ContractsView.tsx` — Contract tracking
- `views/SettingsView.tsx` — User preferences (thresholds, FIO creds, theme)

## Burn Status

- `burn/BurnSummaryList.tsx` — Base burn list (production input/output, workforce consumption)
- `burn/SiteBurnCard.tsx` — Single base burn card
- `burn/BurnRow.tsx` — Material-level burn row
- `burn/BurnBadge.tsx` — Urgency indicator (critical/warning/ok/surplus)
- `burn/DataSourceBadge.tsx` — Shows data source (WebSocket vs FIO vs cache)

## Shared

- `shared/Card.tsx` — Reusable card wrapper
- `shared/MaterialTile.tsx` — Material display (name, amount, color)
- `shared/ProgressBar.tsx` — Visual progress indicator
- `shared/StatusDot.tsx` — Connection/urgency status dot
- `shared/SectionHeader.tsx` — Section divider

## Core Logic (`core/`)

**`burn.ts`** — Integrates production orders, workforce needs, and inventory to compute daily burn rates, days remaining, and urgency classification.

Key functions:
- `calculateProductionRates()` — Sum of order inputs/outputs across lines, weighted by capacity
- `calculateWorkforceConsumption()` — Aggregate material needs across workforce tiers
- `classifyBurnType()` — Determines burn category (input/output/workforce)
- `classifyUrgency()` — Maps days remaining to urgency level (critical=3d, warning=5d, resupply=30d default)
- `calculateSiteBurn()` — Integrates all sources for a single site
- `calculateAllBurns()` — All sites

## Utilities (`lib/`)

- `buffer-opener.ts` — Opens APEX buffers (BS, INV, PROD, etc.) via postMessage
- `buffer-refresh/` — Batch refresh logic (navigates through forms via buffer commands)
- `material-colors.ts` — Material → CSS color mapping (burn urgency, production type)
- `material-categories.ts` — Material taxonomy (food, fuel, etc.)
- `material-lookup.ts` — Ticker → full name
- `fio/` — FIO REST API integration (game data: materials, recipes, planets)
- `desktop-bridge/` — postMessage communication with Helm shell
- `rprun-detect.ts` — Detects refined-prun and offers ACTS integration
- `diagnostics.ts` — Debug overlay for troubleshooting
- `address.ts` — Game location parsing (system/planet/station)
