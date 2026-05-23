# Mobile APEX & Refined PrUn Integration

Full background: [Mobile APEX & APXM Integration Docs](https://github.com/jackinabox86/refined-prun/blob/claude/evaluate-axpm-port-yfUIl/docs/mobile-apex-and-apxm.md)

Topics covered there:
- CSS selector compatibility (verified cross-platform)
- DOM navigation patterns (hierarchical stacks)
- Buffer interaction model (single serial buffer)
- Action runner architecture requirements

## Verified Selectors (desktop & mobile match)

- MaterialSelector containers and inputs
- SliderView (rc-slider)
- Button and FormComponent variants
- ActionFeedback overlay

---

## Hard-Won Mobile DOM Interaction Rules

These rules were established through live debugging of the MTRA action step and apply to any future action step that drives APEX form UI on mobile.

### 1. Buffer Visibility During Form Interaction

The mobile buffer navigator hides `#container` using:
```
visibility: hidden; position: absolute; left: -9999px
```

**WebKit will not deliver focus or keyboard events to hidden or off-screen elements.** Before any form interaction (input focus, typing, button clicks) you must restore both properties:

```typescript
const bufContainer = tile.anchor as HTMLElement;
const prevVisibility = bufContainer.style.visibility;
const prevLeft = bufContainer.style.left;
bufContainer.style.visibility = 'visible';
bufContainer.style.left = '0px';

// ... all form interaction ...

bufContainer.style.left = prevLeft;
bufContainer.style.visibility = prevVisibility;
```

Keep the buffer on-screen for the **entire** interaction sequence — material selection, amount input, button click, and `waitActionFeedback`. Hiding mid-sequence (e.g., before the Transfer click) causes the browser to mis-route the click and can reload the page.

### 2. MaterialSelector Interaction

The `selectMaterial()` helper in `lib/act/action-steps/cont-utils.ts` encapsulates this, but the rules are:

**Focus**: Use `input.focus()`, not `input.click()`. Calling `.click()` on the input loses focus to `<body>` in WebKit.

**Typing**: Use character-by-character keyboard simulation — native setter + a single `input` event is not enough to trigger APEX's autocomplete suggestion logic:

```typescript
for (const char of ticker) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));
  nativeSetter.call(input, input.value + char);
  input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
  await sleep(30);
}
```

**Search term**: APEX's MaterialSelector accepts the ticker directly (e.g., `LC`, `H2O`). Do not convert to a display name — `PrunApi.Material.name` is camelCase (`"aiAssistedLabCoat"`) which does not match APEX's display strings.

**Suggestion matching**: Match entries by `C.ColoredIcon.label` text content against the ticker. The suggestion row shows `[TICKER]  [Full Name]`; the label element contains the ticker.

**Mobile CSS variants**: `C.MaterialSelector` exposes both `input` and `inputMobile` (and similar pairs for other states). On the current APEX mobile build only the desktop-named `input` class is present in the DOM — check `inputMobile` first with a short timeout, fall back to `input`.

**Suggestion list location**: Renders inside the `suggestionsContainer` element (not a React portal). Search within the MaterialSelector container, not `document.body`.

### 3. Button Selection

Never use `$(root, C.Button.btn)` alone — it returns the first matching element in `#container`, which may be an unrelated APEX button (navigation, cancel, etc.). Always find action buttons by text content:

```typescript
const allBtns = _$$<HTMLElement>(tile.anchor, C.Button.btn);
const transferButton = allBtns.find(
  btn => btn.textContent?.trim().toUpperCase() === 'TRANSFER',
);
```

Log all button texts during development to confirm the right one is selected.

### 4. Ship Storage Types

A ship exposes three separate `PrunApi.Store` entries, all sharing the same `name` field (the ship's registration name):

| `type`            | Meaning         |
|-------------------|-----------------|
| `SHIP_STORE`      | Cargo / inventory |
| `STL_FUEL_STORE`  | STL fuel tank   |
| `FTL_FUEL_STORE`  | FTL fuel tank   |

`storagesStore.getByName(shipName)` returns whichever comes first — typically a fuel tank, not the cargo hold. Always use `storagesStore.getByNameAndType(name, 'SHIP_STORE')` when targeting cargo, and the equivalent for fuel stores. See `lib/act/actions/utils.ts` `deserializeStorage()` for the full pattern.

### 5. `PrunApi.Material.name` is camelCase

`material.name` from the API returns internal camelCase identifiers like `"pioneerLuxuryDrink"`, not display strings. APEX's MaterialSelector does **not** filter by this field — use the ticker instead. A `toDisplayName()` helper exists in `cont-utils.ts` if a display name is needed for other purposes.
