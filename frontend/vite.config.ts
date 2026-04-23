import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import fs from "fs";
import path from "path";

const enterprisePath = path.resolve(__dirname, "../enterprise/frontend/src/enterprise");
const hasEnterprise = fs.existsSync(enterprisePath);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    monacoEditorPlugin.default({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html', 'css'],
    }),
  ],
  resolve: {
    alias: {
      '@enterprise': hasEnterprise ? enterprisePath : path.resolve(__dirname, "./src/enterprise_stub"),
      '@bindings/enterprise': hasEnterprise 
        ? path.resolve(__dirname, "./wailsjs/go/enterprise") 
        : path.resolve(__dirname, "./src/enterprise_stub/bindings"),
      '@core': path.resolve(__dirname, "./src"),
      'monaco-editor': path.resolve(__dirname, "node_modules/monaco-editor")
    }
  },
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
