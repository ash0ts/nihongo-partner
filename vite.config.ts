import os from "node:os";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createTutorHandler } from "./server/handler";

/**
 * Dev-only Sensei agent middleware. All logic lives in `server/` (shared with the
 * standalone `pnpm sensei` server and the simulator); this plugin just mounts it.
 * Credentials are read in Node only and never reach the client bundle.
 */
function forgeInferenceTutorPlugin(): Plugin {
  return {
    name: "nihongo-partner-tutor-proxy",
    configureServer(server) {
      const handler = createTutorHandler();
      server.middlewares.use(async (req, res, next) => {
        if (!(await handler.handle(req, res))) next();
      });
      server.httpServer?.once("listening", async () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === "object" && addr ? addr.port : 5178;
        const lan = Object.values(os.networkInterfaces())
          .flat()
          .find((n) => n && n.family === "IPv4" && !n.internal)?.address;
        const tracing = await handler.tracer.enabled();
        const lines = [
          `  Sensei: ${handler.creds ? `${handler.creds.provider} (${handler.creds.model})` : "offline (no WANDB_API_KEY / OPENAI_API_KEY)"}`,
          `  Agent Lens: ${tracing ? handler.tracer.project : "off"}`,
        ];
        if (server.config.server.host && lan) {
          lines.push(`  Phone URL (token included): http://${lan}:${port}/?sensei=${handler.token}`);
        }
        server.config.logger.info(lines.join("\n"));
      });
    },
  };
}

// GitHub Pages serves the app under /<repo>/; local dev and preview stay at /.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    forgeInferenceTutorPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Nihongo Partner",
        short_name: "Nihongo",
        description: "Genki I cram app: kana, grammar, counters, and roleplay drills with a guided study path.",
        theme_color: "#1c1917",
        background_color: "#fafaf9",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The tutor proxy is dev-only; never cache its responses.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
