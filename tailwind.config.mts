import type { Config } from "tailwindcss";

/**
 * Design tokens — single source of truth
 * --------------------------------------------------------------------------
 * The literal values (colours, font stacks, radius) live as CSS variables in
 * `src/frontend/renderer/src/styles/globals.css`, with a light and a dark theme.
 *
 * This file only maps those variables to *named* utility classes
 * (e.g. `bg-status-blocked`, `text-brand`, `text-h1`). Colours are wired as
 * `var(--token)`; Tailwind applies opacity modifiers (`bg-brand/50`) with
 * color-mix(), so they work on every colour.
 *
 * TEAM RULE: if a class you need does not exist, add the token in globals.css
 * and the class here first, then PR it. Never hardcode a hex/rgb.
 */
const config: Config = {
  content: ["./src/frontend/renderer/index.html", "./src/frontend/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* shadcn/ui semantic roles — resolve through globals.css. */
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--color-border-strong)",
        },
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },

        /* Brand tokens. */
        brand: {
          DEFAULT: "var(--color-brand)",
          hover: "var(--color-brand-hover)",
          text: "var(--color-brand-text)",
          light: "var(--color-brand-light)",
          subtle: "var(--color-brand-subtle)",
          secondary: "var(--color-brand-secondary)",
        },
        status: {
          online: "var(--color-status-online)",
          offline: "var(--color-status-offline)",
          blocked: "var(--color-status-blocked)",
          degraded: "var(--color-status-degraded)",
        },
        success: "var(--color-success)",
        host: "var(--color-host)",
        surface: {
          DEFAULT: "var(--color-surface)",
          sidebar: "var(--color-surface-sidebar)",
          raised: "var(--color-surface-raised)",
          muted: "var(--color-surface-muted)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          heading: "var(--color-ink-heading)",
          emphasis: "var(--color-ink-emphasis)",
          muted: "var(--color-ink-muted)",
          subtle: "var(--color-ink-subtle)",
        },
      },

      /* Font families — stacks are defined in globals.css (Poppins for UI, mono for code). */
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
        host: "0 12px 32px -12px color-mix(in srgb, var(--color-shadow) 50%, transparent)", // host card in the network tree
        "card-focus": "0 10px 28px -14px color-mix(in srgb, var(--color-shadow) 35%, transparent)", // selected device card
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
          "0%, 100%": { boxShadow: "0 0 0 0 color-mix(in srgb, var(--color-status-online) 35%, transparent)" },
          "50%": { boxShadow: "0 0 0 6px transparent" },
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
