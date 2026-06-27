import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// /api, /health, /predict, /ws all live on the FastAPI backend (:8001).
// Shared by the dev server (`vite`) and the production preview server
// (`vite preview`) — preview does NOT inherit `server.proxy`, so both
// reference this one map to keep the public domain and localhost identical.
const apiProxy = {
  "/api": { target: "http://localhost:8001", changeOrigin: true },
  "/health": { target: "http://localhost:8001", changeOrigin: true },
  "/predict": { target: "http://localhost:8001", changeOrigin: true },
  "/ws": { target: "ws://localhost:8001", ws: true },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Stock-TimeFM Dashboard",
        short_name: "Stock-TimeFM",
        description:
          "Institutional options flow + ML forecasting dashboard — Notable Flow, intel, signals.",
        theme_color: "#863bff",
        background_color: "#0b0d12",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Cache the shell + bundle but never API responses (always live).
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        // Keep the service worker OFF during `vite dev`. When enabled, workbox
        // precaches the dev-only shell (/src/main.tsx + /@vite/client). That SW
        // survives in the browser into `vite preview`, where those dev URLs 404
        // -> blank page (React never mounts). registerType:"autoUpdate" already
        // self-heals preview->preview rebuilds; the only leak was dev poisoning
        // preview. To test PWA install, run a real build + `vite preview`.
        enabled: false,
      },
    }),
  ],
  server: {
    host: "0.0.0.0", // expose to LAN so the phone can reach Vite
    port: 3000,
    // Accept any Host header — required when fronted by a Cloudflare
    // tunnel that rewrites Host to your public hostname (e.g.
    // app.bididhilli.com). Without this Vite returns
    // "Blocked request. This host is not allowed."
    allowedHosts: true,
    proxy: apiProxy,
  },
  // Production preview server — this is what the Cloudflare tunnel points at
  // (app.bididhilli.com → localhost:3000). Serves the hashed `dist/` build,
  // so the PWA service worker updates cleanly instead of pinning a stale
  // dev shell. `npm run build` first, then `vite preview`.
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    proxy: apiProxy,
  },
});
