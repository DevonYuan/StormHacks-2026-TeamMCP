# Global stylesheet

Source of truth: [`globals.css`](./globals.css), imported from `src/renderer/src/main.tsx`.

Named Tailwind classes that consume those tokens live in [`tailwind.config.ts`](../../../../tailwind.config.ts). The CSS file stores the values. The Tailwind config only names them (`bg-brand`, `text-ink-muted`, `text-h1`).

Two themes, switched by the `dark` class on `<html>`:

- **Light** (default) — warm-neutral palette.
- **Dark** — Variant [CORE.OS Fleet Manager](https://variant.com/shared/4b02b92a-fbf6-4125-aa28-bf51d99a84bc).

Components reference semantic tokens only. Changing the theme restyles them without touching component code.

## Team rule

Never hardcode a hex, `rgb()`, or an inline colour. If a class you need does not exist:

1. Add a raw palette value and a semantic token in `globals.css`.
2. Map it to a named class in `tailwind.config.ts`.
3. Use that class in the component.

## How a colour is stored

Every colour is HSL **channels** only — `"H S% L%"` — with no `hsl()` wrapper and no hex. That lets Tailwind opacity modifiers work:

```html
<div class="bg-brand/50" />
```

which compiles to `hsl(var(--color-brand) / 0.5)`.

Hex comments next to each raw token are the original design values. They are documentation, not the value the app reads.

Tokens are layered:

1. **Raw palette** (`--mcp-*`) — the only place a literal design colour lives.
2. **Semantic tokens** (`--color-*`) — what the app means (brand, surface, status). Light values are set on `:root`. `.dark` overrides them.
3. **shadcn contract** (`--background`, `--primary`, `--border`, …) — each one points at a semantic token, so any shadcn component inherits the palette.

## Semantic colours

Use these Tailwind names. Prefix with `bg-`, `text-`, `border-`, `ring-`, `fill-`, or `stroke-`. Opacity modifiers (`/50`) work on all of them.

| Token | Class stem | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| `--color-brand` | `brand` | `#E8692C` orange | `#4F46E5` indigo-600 | Primary buttons, logo tile |
| `--color-brand-hover` | `brand-hover` | orange | `#6366F1` indigo-500 | Hover, focus ring, progress |
| `--color-brand-text` | `brand-text` | orange | `#818CF8` indigo-400 | Active nav icon, accent text, links |
| `--color-brand-light` | `brand-light` | orange | `#E0E7FF` indigo-100 | Request pulses, active nav text (dark) |
| `--color-brand-subtle` | `brand-subtle` | `#EFEDE8` warm-100 | `#1E1B4B` indigo-950 | Tinted panels |
| `--color-brand-secondary` | `brand-secondary` | orange | `#22D3EE` cyan-400 | Host status dot, gradient partner, IPs |
| `--color-host` | `host` | `#111111` ink | indigo-600 | Host card in the network tree |
| `--color-status-online` | `status-online` | `#3F4A6B` denim | cyan-400 | Online devices. Names match `DeviceStatus` |
| `--color-status-offline` | `status-offline` | `#B9B7B1` warm-400 | `#334155` slate-700 | Offline devices, stopped servers, idle sparklines |
| `--color-status-blocked` | `status-blocked` | orange | `#F43F5E` rose-500 | Blocked devices, denied calls |
| `--color-status-degraded` | `status-degraded` | `#FBBF24` amber-400 | amber-400 | Degraded state |
| `--color-success` | `success` | `#34D399` emerald-400 | emerald-400 | Positive trends |
| `--color-surface` | `surface` | `#F7F6F3` warm-50 | `#030712` gray-950 | App background, status bar |
| `--color-surface-sidebar` | `surface-sidebar` | warm-100 | `#090E1A` navy | Sidebar |
| `--color-surface-raised` | `surface-raised` | `#FFFFFF` | `#0F172A` slate-900 | Cards |
| `--color-surface-muted` | `surface-muted` | `#EBEAE7` warm-150 | `#1E293B` slate-800 | Hover, neutral badges |
| `--color-border` | `border` | `#E7E5E0` warm-200 | slate-800 | Hairline borders |
| `--color-border-strong` | `border-strong` | warm-400 | slate-700 | Stronger borders |
| `--color-ink-heading` | `ink-heading` | ink | white | Page titles, stat values |
| `--color-ink-emphasis` | `ink-emphasis` | ink | `#E2E8F0` slate-200 | Primary text |
| `--color-ink` | `ink` | `#6B6A66` warm-600 | `#94A3B8` slate-400 | Secondary text |
| `--color-ink-muted` | `ink-muted` | warm-400 | `#64748B` slate-500 | Hints, section headers |
| `--color-ink-subtle` | `ink-subtle` | warm-400 | `#475569` slate-600 | Disabled |

`--color-shadow` tints elevated shadows (`shadow-host`, `shadow-card-focus`). It is ink in light and indigo-600 in dark. There is no `shadow` colour class; use the shadow utilities below.

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
| `sidebar-active` | Selected nav item. Raised card in light. Indigo fade plus a left bar in dark. |
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
- Default border colour is `hsl(var(--border))`.

## Adding a token

```css
/* globals.css — raw value, then semantic alias */
--mcp-example: 200 40% 50%; /* #4C8CA6 */
--color-example: var(--mcp-example);
```

Override `--color-example` inside `.dark` if the dark theme needs a different source colour.

```ts
/* tailwind.config.ts */
example: "hsl(var(--color-example) / <alpha-value>)",
```

Then use `bg-example`, `text-example`, or `border-example` in components.
