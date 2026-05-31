import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        fleet: {
          active: "hsl(var(--status-active))",
          idle: "hsl(var(--status-idle))",
          offline: "hsl(var(--status-offline))",
          "active-bg": "hsl(var(--status-active-bg))",
          "idle-bg": "hsl(var(--status-idle-bg))",
          "offline-bg": "hsl(var(--status-offline-bg))",
        },
        visit: {
          pending: "hsl(var(--visit-pending))",
          arrived: "hsl(var(--visit-arrived))",
          completed: "hsl(var(--visit-completed))",
          skipped: "hsl(var(--visit-skipped))",
        },
        // Mission Control Pro design tokens (OKLCH, theme-aware)
        mc: {
          DEFAULT: "var(--mc-bg)",
          elev: "var(--mc-bg-elev)",
          surface: "var(--mc-surface)",
          "surface-hi": "var(--mc-surface-hi)",
          border: "var(--mc-border)",
          "border-strong": "var(--mc-border-strong)",
          text: "var(--mc-text)",
          "text-muted": "var(--mc-text-muted)",
          "text-dim": "var(--mc-text-dim)",
          accent: "var(--mc-accent)",
          "accent-strong": "var(--mc-accent-strong)",
          "accent-soft": "var(--mc-accent-soft)",
          "accent-border": "var(--mc-accent-border)",
          "accent-fg": "var(--mc-accent-fg)",
          "field-bg": "var(--mc-field-bg)",
          "field-bg-focus": "var(--mc-field-bg-focus)",
          error: "var(--mc-error)",
          "error-soft": "var(--mc-error-soft)",
          "error-border": "var(--mc-error-border)",
        },
        status: {
          moving: "var(--mc-status-moving)",
          idle: "var(--mc-status-idle)",
          offline: "var(--mc-status-offline)",
          pending: "var(--mc-status-pending)",
          arrived: "var(--mc-status-arrived)",
        },
        map: {
          bg: "var(--mc-map-bg)",
          block: "var(--mc-map-block)",
          road: "var(--mc-map-road)",
          "road-soft": "var(--mc-map-road-soft)",
          park: "var(--mc-map-park)",
          water: "var(--mc-map-water)",
          label: "var(--mc-map-label)",
          grid: "var(--mc-map-grid)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        mc: "8px",
        "mc-lg": "12px",
        pill: "999px",
      },
      boxShadow: {
        "mc-card": "0 4px 16px oklch(0 0 0 / 0.08)",
        "mc-float": "0 8px 24px oklch(0 0 0 / 0.20)",
        "mc-palette": "0 24px 64px oklch(0 0 0 / 0.50)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        pinpulse: {
          "0%": { transform: "scale(0.7)", opacity: "0.5" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        livepulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.4)" },
        },
        drift: {
          "0%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(6px, -3px)" },
          "100%": { transform: "translate(-4px, 4px)" },
        },
        "trail-dash": {
          to: { "stroke-dashoffset": "-200" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        pinpulse: "pinpulse 2s ease-out infinite",
        livepulse: "livepulse 2s ease-in-out infinite",
        drift: "drift 14s ease-in-out infinite alternate",
        "trail-dash": "trail-dash 28s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
