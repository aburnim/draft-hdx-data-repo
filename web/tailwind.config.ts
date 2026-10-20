import type { Config } from "tailwindcss";

// Palette from hetstar's tailwind.config.ts (Dynamic PDB's Prism brand kit): purple is the
// only saturated UI color, reserved for links, pressed state and focus. Scientific colors
// (ΔG ramps, deuteration) live in src/hdx/colors.ts and are not tokens.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#663be4", hover: "#5730c7", soft: "#f1edfd" },
        ink: { DEFAULT: "#1a1e2a", secondary: "#3d414f", muted: "#5f616b" },
        line: { DEFAULT: "#eaebf4", strong: "#d5d7e4" },
        surface: { DEFAULT: "#ffffff", muted: "#f2f3f8" },
        danger: { DEFAULT: "#b4231d", soft: "#fbecea" },
      },
      boxShadow: { "ring-accent": "0 0 0 3px rgba(102, 59, 228, 0.2)" },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
