import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built site works from any static host or sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 8000 },
});
