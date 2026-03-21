import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary:             "#006092",
        "primary-dim":       "#005480",
        "primary-container": "#4db0f7",
        secondary:           "#006a2e",
        "secondary-container": "#5dfd8a",
        "on-primary":        "#ebf4ff",
        "on-secondary":      "#ceffd0",
        background:          "#f3f6ff",
        surface:             "#f3f6ff",
        "surface-container":      "#dce9ff",
        "surface-container-low":  "#eaf1ff",
        "surface-container-high": "#d2e4ff",
        "on-background":     "#12304f",
        "on-surface":        "#12304f",
        "on-surface-variant":"#425d7f",
        outline:             "#5e799c",
        "outline-variant":   "#94afd5",
        whatsapp:            "#25D366",
        telegram:            "#229ED9",
      },
      fontFamily: {
        headline: ["'Plus Jakarta Sans'", "sans-serif"],
        body:     ["'Be Vietnam Pro'",   "sans-serif"],
        sans:     ["'Be Vietnam Pro'",   "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "3rem",
        "6xl": "4rem",
      },
    },
  },
  plugins: [],
};

export default config;
