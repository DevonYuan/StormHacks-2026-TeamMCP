# Global stylesheet

Source of truth: [`globals.css`](./globals.css), imported from `src/renderer/src/main.tsx`.

Named Tailwind classes that consume those tokens live in [`tailwind.config.ts`](../../../../tailwind.config.ts). The CSS file stores the values. The Tailwind config only names them (`bg-brand`, `text-ink-muted`, `text-h1`).

Two themes, switched by the `dark` class on `<html>`:

- **Light** (default) — warm-neutral palette.
- **Dark** — based on Variant [CORE.OS Fleet Manager](https://variant.com/shared/4b02b92a-fbf6-4125-aa28-bf51d99a84bc), with a light-blue brand.

Components reference semantic tokens only. Changing the theme restyles them without touching component code.

## Team rule

Never hardcode a hex, `rgb()`, or an inline colour. If a class you need does not exist:

1. Add a raw palette value and a semantic token in `globals.css`.
2. Map it to a named class in `tailwind.config.ts`.
3. Use that class in the component.

## How a colour is stored

**One raw value per colour.** There are no `100`…`950` shade ranges. A lighter or darker step is the raw colour blended over the theme's canvas at a percentage, which is its opacity:

```css
/* 28% ink over paper — replaces a stored "warm-400" */
--color-ink-muted: color-mix(in srgb, hsl(var(--mcp-ink)) 28%, hsl(var(--mcp-paper)));
```

Blends are opaque, so a card on a card, or a card over the dot grid, never shows through. The canvas is `--mcp-paper` in light and `--mcp-night` in dark.

Tokens are layered:

1. **Raw palette** (`--mcp-*`) — HSL channels only (`"H S% L%"`), no `hsl()` wrapper, no hex. The only place a literal design colour lives. Hex comments are documentation, not the value the app reads.
2. **Semantic tokens** (`--color-*`) — complete colours: `hsl(var(--mcp-x))` or a `color-mix()` blend. Light values are set on `:root`. `.dark` overrides them.
3. **shadcn contract** (`--background`, `--primary`, `--border`, …) — each one points at a semantic token, so any shadcn component inherits the palette.

Tailwind opacity modifiers still work on every token:

```html
<div class="bg-brand/50" />
```

which compiles to `color-mix(in oklab, var(--color-brand) 50%, transparent)`.

### Raw palette

| Token | Hex | Theme | Role |
| --- | --- | --- | --- |
| `--mcp-paper` | `#F7F6F3` | Light | Canvas |
| `--mcp-ink` | `#111111` | Light | Neutral, blended over paper |
| `--mcp-denim` | `#3F4A6B` | Light | Online |
| `--mcp-orange` | `#E8692C` | Light | Brand, blocked |
| `--mcp-night` | `#030712` | Dark | Canvas |
| `--mcp-slate` | `#E2E8F0` | Dark | Neutral, blended over night |
| `--mcp-blue` | `#B2CBF2` | Dark | Brand |
| `--mcp-cyan` | `#22D3EE` | Dark | Online, secondary accent |
| `--mcp-white` | `#FFFFFF` | Both | Cards (light), headings (dark) |
| `--mcp-emerald` | `#34D399` | Both | Success |
| `--mcp-amber` | `#FBBF24` | Both | Degraded |
| `--mcp-rose` | `#F43F5E` | Dark | Blocked |

## Semantic colours

Use these Tailwind names. Prefix with `bg-`, `text-`, `border-`, `ring-`, `fill-`, or `stroke-`. Opacity modifiers (`/50`) work on all of them.

| Token | Class stem | Light | Dark | Use |
| --- | --- | --- | --- | --- |
A percentage means "that share of the raw colour blended over the canvas".

| Token | Class stem | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| `--color-brand` | `brand` | orange | blue | Primary buttons, logo tile |
| `--color-brand-hover` | `brand-hover` | orange | blue 85% | Hover, focus ring, active nav bar |
| `--color-brand-text` | `brand-text` | orange | blue | Active nav icon, accent text, links |
| `--color-brand-light` | `brand-light` | orange | blue | Request pulses, active nav text (dark) |
| `--color-brand-subtle` | `brand-subtle` | ink 3.5% | blue 20% | Tinted panels |
| `--color-brand-secondary` | `brand-secondary` | orange | cyan | Host status dot, gradient partner, IPs |
| `--color-on-brand` | `primary-foreground` | white | night | Text and icons on brand and host surfaces |
| `--color-host` | `host` | ink | blue | Host card in the network tree |
| `--color-status-online` | `status-online` | denim | cyan | Online devices. Names match `DeviceStatus` |
| `--color-status-offline` | `status-offline` | ink 28% | slate 26% | Offline devices, stopped servers, idle sparklines |
| `--color-status-blocked` | `status-blocked` | orange | rose | Blocked devices, denied calls |
| `--color-status-degraded` | `status-degraded` | amber | amber | Degraded state |
| `--color-success` | `success` | emerald | emerald | Positive trends |
| `--color-surface` | `surface` | paper | night | App background, status bar |
| `--color-surface-sidebar` | `surface-sidebar` | ink 3.5% | slate 3% | Sidebar |
| `--color-surface-raised` | `surface-raised` | white | slate 8% | Cards |
| `--color-surface-muted` | `surface-muted` | ink 5% | slate 15% | Hover, neutral badges |
| `--color-border` | `border` | ink 7% | slate 15% | Hairline borders |
| `--color-border-strong` | `border-strong` | ink 28% | slate 26% | Stronger borders |
| `--color-ink-heading` | `ink-heading` | ink | white | Page titles, stat values |
| `--color-ink-emphasis` | `ink-emphasis` | ink | slate | Primary text |
| `--color-ink` | `ink` | ink 61% | slate 70% | Secondary text |
| `--color-ink-muted` | `ink-muted` | ink 28% | slate 48% | Hints, section headers |
| `--color-ink-subtle` | `ink-subtle` | ink 28% | slate 35% | Disabled |

`--color-shadow` tints elevated shadows (`shadow-host`, `shadow-card-focus`). It is ink in light and blue in dark. There is no `shadow` colour class; use the shadow utilities below.

The dark brand blue is light, so `--color-on-brand` flips to night in dark mode. Always put `text-primary-foreground` on `bg-brand` or `bg-host`, never `text-white`.

shadcn roles (`background`, `foreground`, `primary`, `card`, `muted`, `destructive`, `ring`, …) resolve through the same tokens. Prefer the semantic names above in app code. Use the shadcn names inside shadcn components.

## Typography

The whole UI is monospace. Stacks are OS fonts, so nothing is bundled:

```text
Consolas, Menlo, Monaco, "Courier New", monospace
```

`font-sans`, `font-body`, `font-heading`, and `font-mono` all resolve to that stack.

Use these named sizes instead of Tailwind's default `text-sm` / `text-lg` scale. Sizes assume a 16px root.

| Class | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `text-h1` | 30px | 700 | tight | Page title |
| `text-h2` | 24px | 700 | — | Stat values |
| `text-h3` | 14px | 700 | — | Card titles, names |
| `text-h4` | 12px | 700 | wide | Eyebrow. Also add `uppercase` |
| `text-h5` | 11px | 700 | wider | Table headers. Also add `uppercase` |
| `text-body-large` | 16px | 400 | — | Large body |
| `text-body` | 14px | 400 | — | Body |
| `text-body-small` | 12px | 400 | — | Small body |
| `text-caption` | 11px | 400 | — | Helper text |
| `text-nav` | 14px | 500 | — | Sidebar items |
| `text-button` | 14px | 600 | — | Buttons |
| `text-label` | 12px | 500 | wide | Stat labels. Also add `uppercase` |
| `text-overline` | 10px | 700 | wider | Sidebar sections. Also add `uppercase` |
| `text-badge` | 9px | 900 | — | Tags. Also add `uppercase` |
| `text-code` | 12px | 400 | — | IPs and code. Pair with `font-mono` |

## Radius, layout, shadow, motion

Radius is driven by `--radius` (12px).

| Class | Value | Use |
| --- | --- | --- |
| `rounded-xl` | 16px | Cards |
| `rounded-lg` | 12px | Buttons, inputs |
| `rounded-md` | 10px | — |
| `rounded-sm` | 8px | Icon tiles |

| Token | Value | Classes |
| --- | --- | --- |
| `--titlebar-height` | 40px | `h-titlebar`, `pt-titlebar` |
| `--header-height` | 64px | `h-header` |
| `--statusbar-height` | 32px | `h-statusbar` |
| `--sidebar-width` | 256px | `w-sidebar` |
| `--content-max-width` | 1440px | `max-w-content` |

Shell grids: `grid-cols-shell` is sidebar + main column. `grid-rows-shell` is main row + status bar.

| Class | Use |
| --- | --- |
| `shadow-host` | Host card in the network tree |
| `shadow-card-focus` | Selected device card |
| `animate-breathe` | Live status dots. 2.8s pulse using `--color-status-online` |

## Utilities

Defined with `@utility` in `globals.css`, so variants such as `hover:` and `md:` work.

| Class | What it does |
| --- | --- |
| `glass-card` | Card surface. Solid in light, translucent glass (`backdrop-blur`) in dark. Pair with `rounded-xl`. |
| `sidebar-active` | Selected nav item. Raised card in light. Blue fade plus a left bar in dark. |
| `status-glow-online` | Halo around an online status dot. |
| `dot-grid` | Dotted canvas behind the network tree. 20px grid. |
| `drag-region` | Frameless Electron window drag (`-webkit-app-region: drag`). |
| `no-drag` | Opt an interactive control out of dragging. Put this on buttons and inputs inside a `drag-region`. |

## Base behaviour

`@layer base` sets desktop-app defaults:

- The window does not scroll. `html`, `body`, and `#root` are `height: 100%` and `overflow: hidden`. Scroll individual panes.
- Body uses the surface background, emphasis foreground, and the mono stack, with antialiased text.
- UI chrome is not selectable (`user-select: none`). Inputs, textareas, `contenteditable`, `pre`, and `code` opt back in. Add `select-text` anywhere else that should be selectable.
- Scrollbars are 6px, coloured from surface tokens.
- Default border colour is `var(--border)`.

## Adding a token

Reuse an existing raw colour at a new percentage before adding a new raw colour. Never add a shade range.

```css
/* globals.css — semantic token from an existing raw colour */
--color-example: color-mix(in srgb, hsl(var(--mcp-ink)) 40%, hsl(var(--mcp-paper)));

/* a genuinely new hue: one raw value, then the semantic alias */
--mcp-teal: 174 60% 40%; /* #29A396 */
--color-example: hsl(var(--mcp-teal));
```

Override `--color-example` inside `.dark` (blending over `--mcp-night`) if the dark theme needs a different value.

```ts
/* tailwind.config.ts */
example: "var(--color-example)",
```

Then use `bg-example`, `text-example`, or `border-example` in components.
