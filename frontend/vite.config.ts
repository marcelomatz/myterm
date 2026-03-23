import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  build: {
    // Output goes to frontend/dist — that's what Go embeds.
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "esnext",
    minify: "esbuild",
  },
  server: {
    // Wails dev server uses port auto-detection; keep a stable port here too.
    port: 34115,
    strictPort: false,
    hmr: {
      // Required for Wails DevServer bridge
      protocol: "ws",
      host: "localhost",
      port: 34115,
    },
  },
});
