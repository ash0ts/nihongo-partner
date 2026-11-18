import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

interface TutorCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
  project?: string;
  provider: "forge-inference" | "openai-compatible";
}

function readWandbNetrcKey(): string | undefined {
  try {
    const netrcPath = path.join(os.homedir(), ".netrc");
    if (!fs.existsSync(netrcPath)) return undefined;
    const raw = fs.readFileSync(netrcPath, "utf8");
    const blockMatch = raw.match(/machine\s+api\.wandb\.ai[\s\S]*?(?=\nmachine\s+|\s*$)/);
    if (!blockMatch) return undefined;
    const passMatch = blockMatch[0].match(/password\s+(\S+)/);
    return passMatch?.[1];
  } catch {
    return undefined;
  }
}

function resolveTutorCredentials(): TutorCredentials | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      project: process.env.OPENAI_PROJECT,
      provider: "openai-compatible",
    };
  }

  const wandbKey = process.env.WANDB_API_KEY || readWandbNetrcKey();
  if (wandbKey) {
    return {
      apiKey: wandbKey,
      baseUrl: (process.env.FORGE_INFERENCE_BASE_URL || "https://api.inference.wandb.ai/v1").replace(
        /\/+$/,
        "",
      ),
      model: process.env.FORGE_INFERENCE_MODEL || "zai-org/GLM-5.3-Flash",
      project:
        process.env.FORGE_INFERENCE_PROJECT ||
        process.env.OPENAI_PROJECT ||
        "wandb/forge-wrapped-2026",
      provider: "forge-inference",
    };
  }

  return null;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function forgeInferenceTutorPlugin(): Plugin {
  return {
    name: "nihongo-partner-tutor-proxy",
    configureServer(server) {
      server.middlewares.use("/api/tutor/status", (_req, res) => {
        const creds = resolveTutorCredentials();
        sendJson(res, 200, {
          available: Boolean(creds),
          provider: creds?.provider ?? null,
          model: creds?.model ?? null,
        });
      });

      server.middlewares.use("/api/tutor/chat", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }
        const creds = resolveTutorCredentials();
        if (!creds) {
          sendJson(res, 503, {
            error:
              "Live Sensei is not configured. Set WANDB_API_KEY (or run `wandb login`) for Forge Inference, or set OPENAI_API_KEY. Deterministic Sensei drills remain fully available.",
          });
          return;
        }

        try {
          const body = await readJsonBody(req);
          const scenarioTitle = String(body.scenarioTitle || "Genki Lesson 1-2 Practice");
          const allowedGrammar = Array.isArray(body.allowedGrammar)
            ? body.allowedGrammar.map(String).slice(0, 24)
            : [];
          const allowedVocab = Array.isArray(body.allowedVocab)
            ? body.allowedVocab.map(String).slice(0, 80)
            : [];
          const userMessage = String(body.userMessage || "").slice(0, 600);
          const mode = body.mode === "grade" ? "grade" : "roleplay";
          const history = Array.isArray(body.history)
            ? body.history
                .slice(-8)
                .map((m: unknown) => {
                  const item = m as { role?: string; content?: string };
                  return {
                    role: item.role === "assistant" ? "assistant" : "user",
                    content: String(item.content || "").slice(0, 500),
                  };
                })
            : [];

          const systemPrompt =
            mode === "grade"
              ? [
                  "You are a concise, accurate Japanese Sensei grading a student cramming Genki I Lessons 0-2 before starting Lesson 3.",
                  "Stay strictly inside beginner polite Japanese (desu / janai desu, wa/ka/no/mo/ne/yo, ko-so-a-do, numbers/time/age/yen).",
                  "CRITICAL PHONETIC FACTS: 4th-year student IS よねんせい (yonensei, NOT yonnensei); 4:00 IS よじ; 7:00 IS しちじ; 9:00 IS くじ; 20 years old IS はたち; 300/600/800 = さんびゃく/ろっぴゃく/はっぴゃく; 3000/8000 = さんぜん/はっせん; over there = あそこ.",
                  `Unlocked grammar patterns: ${allowedGrammar.join("; ")}`,
                  "Return JSON ONLY with keys: {\"correct\": boolean, \"japanese\": string, \"reading\": string, \"feedback\": string, \"trapNote\": string}.",
                  "Write `feedback` and `trapNote` in clear, direct ENGLISH (under 40 words each). In `japanese`, give the natural polite Japanese sentence, and in `reading` give its pure hiragana/katakana reading.",
                ].join("\n")
              : [
                  `You are roleplaying a friendly Japanese conversation partner in scenario: ${scenarioTitle}.`,
                  "Constrain your Japanese strictly to Genki I Lessons 0-2 polite speech (plus simple classroom survival phrases). Never use casual plain forms.",
                  "CRITICAL PHONETIC FACTS: 4th-year student = よねんせい; 4:00 = よじ; 9:00 = くじ; 20 yrs = はたち; over there = あそこ.",
                  `Unlocked grammar: ${allowedGrammar.join("; ")}`,
                  `Key vocabulary pool: ${allowedVocab.join(", ")}`,
                  "Return JSON ONLY with keys: {\"replyJp\": string, \"replyKana\": string, \"replyEn\": string, \"coachTip\": string}.",
                  "`replyJp` must be 1-2 short natural polite Japanese sentences continuing the conversation and ending with an easy question. Write `replyEn` and `coachTip` in clear ENGLISH (`coachTip` under 35 words).",
                ].join("\n");

          const headers: Record<string, string> = {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          };
          if (creds.project) {
            headers["OpenAI-Project"] = creds.project;
          }

          const payload: Record<string, unknown> = {
            model: creds.model,
            temperature: 0.4,
            max_tokens: 700,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              ...history,
              { role: "user", content: userMessage },
            ],
          };

          if (creds.provider === "forge-inference") {
            payload.chat_template_kwargs = { enable_thinking: false };
            payload.thinking = { type: "disabled" };
          }

          const upstream = await fetch(`${creds.baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

          if (!upstream.ok) {
            const detail = await upstream.text();
            sendJson(res, upstream.status, {
              error: `Upstream inference returned ${upstream.status}: ${detail.slice(0, 240)}`,
            });
            return;
          }

          const data = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawContent = data.choices?.[0]?.message?.content || "{}";
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawContent);
          } catch {
            parsed = { raw: rawContent };
          }
          sendJson(res, 200, { ok: true, model: creds.model, result: parsed });
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Tutor request failed",
          });
        }
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
