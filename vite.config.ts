/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Local development runs on https://localhost:4443, the origin the Astria API
// already permits for CORS (see README). `server.pem` holds both the key and
// the certificate (openssl req -new -x509 -keyout server.pem -out server.pem
// -days 365 -nodes); without it the dev server falls back to plain HTTP, which
// Photopea (https) refuses to embed, so the fixture mode is the only option.
const pem = resolve(__dirname, "server.pem");
// PLUGIN_HTTP=1 serves plain HTTP (for browser tooling that rejects the
// self-signed certificate); Photopea itself needs the HTTPS origin.
const https = existsSync(pem) && !process.env.PLUGIN_HTTP ? { key: readFileSync(pem), cert: readFileSync(pem) } : undefined;

export default defineConfig({
  root: resolve(__dirname, "plugin"),
  base: "./",
  publicDir: resolve(__dirname, "plugin/public"),
  plugins: [react()],
  define: {
    __PLUGIN_VERSION__: JSON.stringify(process.env.npm_package_version || "0.0.0")
  },
  server: {
    host: "localhost",
    port: 4443,
    strictPort: true,
    https,
    // The dev build calls the API through this same-origin path (see
    // bootstrap.ts), so it works from any local port or scheme regardless of
    // the API's CORS allowlist. PLUGIN_API overrides the upstream (a local
    // sdbooth).
    proxy: {
      "/astria-api": {
        target: process.env.PLUGIN_API || "https://api.astria.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/astria-api/, "")
      }
    }
  },
  build: {
    // The preview build is committed and served by GitHub Pages under /next/
    // beside the legacy plugin at the repository root.
    outDir: resolve(__dirname, "next"),
    emptyOutDir: true,
    sourcemap: false,
    target: ["chrome111", "safari16", "firefox115"]
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
