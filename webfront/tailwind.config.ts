import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        green: {
          brand: "#25D366",
          dark:  "#1DA851",
        },
        blue: {
          brand: "#229ED9",
          dark:  "#1A7DAE",
        },
        graphite: {
          DEFAULT: "#1F2937",
          light:   "#374151",
          muted:   "#6B7280",
        },
        surface: "#F5F7FA",
        divider: "#E5E7EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
