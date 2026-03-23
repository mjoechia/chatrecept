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
        // Warm off-white surfaces
        background:          "#f8f7f3",
        surface:             "#f8f7f3",
        "surface-container":      "#e8e6de",
        "surface-container-low":  "#f1efe8",
        "surface-container-high": "#dddbd2",
        "on-background":     "#12304f",
        "on-surface":        "#12304f",
        "on-surface-variant":"#425d7f",
        outline:             "#5e799c",
        "outline-variant":   "#94afd5",
        // Amber accent
        amber:               "#b45309",
        "amber-container":   "#fef3c7",
        "amber-glow":        "rgba(251,191,36,0.15)",
        // Messaging platform colours
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
