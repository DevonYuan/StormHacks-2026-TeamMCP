import type { Config } from "tailwindcss";

/**
 * Design tokens — single source of truth
 * --------------------------------------------------------------------------
 * The literal values (HSL colours, font stacks, radius) live as CSS variables
 * in `src/renderer/src/styles/globals.css`.
 * Source: Variant "CORE.OS Fleet Manager" (dark theme)
 * https://variant.com/shared/4b02b92a-fbf6-4125-aa28-bf51d99a84bc
 *
 * This file only maps those variables to *named* utility classes
 * (e.g. `bg-status-blocked`, `text-brand`, `text-h1`). Colours are wired as
 * `hsl(var(--token) / <alpha-value>)` so opacity modifiers keep working.
 *
 * TEAM RULE: if a class you need does not exist, add the token in globals.css
 * and the class here first, then PR it. Never hardcode a hex/rgb.
 */
const config: Config = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* shadcn/ui semantic roles — resolve through globals.css. */
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong: "hsl(var(--color-border-strong) / <alpha-value>)",
        },
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },

        /* Brand tokens. */
        brand: {
          DEFAULT: "hsl(var(--color-brand) / <alpha-value>)",
          hover: "hsl(var(--color-brand-hover) / <alpha-value>)",
          text: "hsl(var(--color-brand-text) / <alpha-value>)",
          light: "hsl(var(--color-brand-light) / <alpha-value>)",
          subtle: "hsl(var(--color-brand-subtle) / <alpha-value>)",
          secondary: "hsl(var(--color-brand-secondary) / <alpha-value>)",
        },
        status: {
          online: "hsl(var(--color-status-online) / <alpha-value>)",
          offline: "hsl(var(--color-status-offline) / <alpha-value>)",
          blocked: "hsl(var(--color-status-blocked) / <alpha-value>)",
          degraded: "hsl(var(--color-status-degraded) / <alpha-value>)",
        },
        success: "hsl(var(--color-success) / <alpha-value>)",
        host: "hsl(var(--color-host) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--color-surface) / <alpha-value>)",
          sidebar: "hsl(var(--color-surface-sidebar) / <alpha-value>)",
          raised: "hsl(var(--color-surface-raised) / <alpha-value>)",
          muted: "hsl(var(--color-surface-muted) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "hsl(var(--color-ink) / <alpha-value>)",
          heading: "hsl(var(--color-ink-heading) / <alpha-value>)",
          emphasis: "hsl(var(--color-ink-emphasis) / <alpha-value>)",
          muted: "hsl(var(--color-ink-muted) / <alpha-value>)",
          subtle: "hsl(var(--color-ink-subtle) / <alpha-value>)",
        },
      },

      /* Font families — stacks are defined in globals.css (all monospace). */
      fontFamily: {
        sans: ["var(--font-body)"],
        body: ["var(--font-body)"],
        heading: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },

      /*
       * Font scale — px values are exact from the design (rem assumes a 16px
       * root). Rows marked "uppercase" also need the `uppercase` class.
       * Use these named tokens instead of Tailwind's default text-* sizes.
       */
      fontSize: {
        h1: ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700", letterSpacing: "-0.025em" }], // 30 · Bold · page title
        h2: ["1.5rem", { lineHeight: "2rem", fontWeight: "700" }], // 24 · Bold · stat values
        h3: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "700" }], // 14 · Bold · card titles, names
        h4: ["0.75rem", { lineHeight: "1rem", fontWeight: "700", letterSpacing: "0.05em" }], // 12 · Bold · eyebrow, uppercase
        h5: ["0.6875rem", { lineHeight: "1rem", fontWeight: "700", letterSpacing: "0.1em" }], // 11 · Bold · table headers, uppercase
        "body-large": ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }], // 16 · Regular
        body: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }], // 14 · Regular
        "body-small": ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }], // 12 · Regular
        caption: ["0.6875rem", { lineHeight: "1rem", fontWeight: "400" }], // 11 · Regular · helper text
        nav: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }], // 14 · Medium · sidebar items
        button: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "600" }], // 14 · Semi-bold
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "500", letterSpacing: "0.05em" }], // 12 · Medium · stat labels, uppercase
        overline: ["0.625rem", { lineHeight: "0.9375rem", fontWeight: "700", letterSpacing: "0.1em" }], // 10 · Bold · sidebar sections, uppercase
        badge: ["0.5625rem", { lineHeight: "0.875rem", fontWeight: "900" }], // 9 · Black · tags, uppercase
        code: ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }], // 12 · Regular · IPs, use with font-mono
      },

      /* Radius — driven by --radius (12px) in globals.css. */
      borderRadius: {
        xl: "calc(var(--radius) + 4px)", // 16 · cards
        lg: "var(--radius)", // 12 · buttons, inputs
        md: "calc(var(--radius) - 2px)", // 10
        sm: "calc(var(--radius) - 4px)", // 8 · icon tiles
      },

      boxShadow: {
        host: "0 12px 32px -12px hsl(var(--color-shadow) / 0.5)", // host card in the network tree
        "card-focus": "0 10px 28px -14px hsl(var(--color-shadow) / 0.35)", // selected device card
      },

      spacing: {
        titlebar: "var(--titlebar-height)",
        header: "var(--header-height)",
        statusbar: "var(--statusbar-height)",
        sidebar: "var(--sidebar-width)",
      },

      maxWidth: {
        content: "var(--content-max-width)",
      },

      /* App shell: sidebar + main column, main row + status bar. */
      gridTemplateColumns: {
        shell: "var(--sidebar-width) 1fr",
      },
      gridTemplateRows: {
        shell: "1fr auto",
      },

      keyframes: {
        breathe: {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--color-status-online) / 0.35)" },
          "50%": { boxShadow: "0 0 0 6px hsl(var(--color-status-online) / 0)" },
        },
      },
      animation: {
        breathe: "breathe 2.8s ease-in-out infinite", // live status dots
      },
    },
  },
  plugins: [],
};

export default config;
