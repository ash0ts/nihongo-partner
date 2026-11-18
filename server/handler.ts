import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TutorStatus } from "../src/engine/tutor-types";
import { createSensei, type Sensei } from "./agent/sensei";
import { resolveTutorCredentials, type TutorCredentials } from "./credentials";
import { createTraceRunner, type TraceRunner } from "./tracing";

/**
 * Request handler shared by the Vite dev middleware and the standalone server.
 *
 * Access rule: loopback callers are trusted; anyone else must present `X-Sensei-Token`
 * (or `?sensei=` on the page URL, which the client stores and forwards). This is what
 * keeps `pnpm dev:phone` from turning your inference key into an open relay on shared Wi-Fi.
 */
export interface TutorHandlerOptions {
  creds?: TutorCredentials | null;
  tracer?: TraceRunner;
  token?: string;
  /** Disable the token check entirely (tests). */
  allowAll?: boolean;
}

export interface TutorHandler {
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  token: string;
  creds: TutorCredentials | null;
  sensei: Sensei;
  tracer: TraceRunner;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 512_000) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
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

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const str = (v: unknown, max = 600) => String(v ?? "").slice(0, max);
const strList = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, 200)).slice(0, max) : []);
const mode = (v: unknown): "bridge" | "classroom" | "immersion" =>
  v === "classroom" || v === "immersion" ? v : "bridge";

function learnerContext(body: Record<string, unknown>) {
  const events = Array.isArray(body.recentEvents) ? body.recentEvents.slice(-200) : undefined;
  return {
    sessionId: str(body.sessionId, 80) || "anonymous",
    // `displayMode` is the learner's orthography mode; `/chat` keeps legacy `mode: grade|roleplay` for the task.
    mode: mode(body.displayMode ?? (body.mode === "grade" || body.mode === "roleplay" ? undefined : body.mode)),
    unitId: body.unitId ? str(body.unitId, 80) : undefined,
    recentEvents: events as never,
    persona: body.persona ? str(body.persona, 40) : undefined,
  };
}

export function createTutorHandler(options: TutorHandlerOptions = {}): TutorHandler {
  const creds = options.creds === undefined ? resolveTutorCredentials() : options.creds;
  const tracer = options.tracer ?? createTraceRunner();
  const token = options.token ?? process.env.SENSEI_TOKEN ?? crypto.randomBytes(12).toString("hex");
  const sensei = createSensei({ creds, tracer });
  // "bare" omits PHONETIC_FACTS; the evals A/B the two prompts through the same server.
  const bareSensei = createSensei({ creds, tracer, promptVariant: "bare" });
  const pick = (body: Record<string, unknown>): Sensei => (body.promptVariant === "bare" ? bareSensei : sensei);

  async function status(): Promise<TutorStatus> {
    return {
      available: Boolean(creds),
      provider: creds?.provider ?? null,
      model: creds?.model ?? null,
      tracing: await tracer.enabled(),
      project: tracer.project,
      tokenRequired: !options.allowAll,
    };
  }

  function authorized(req: IncomingMessage): boolean {
    if (options.allowAll || isLoopback(req)) return true;
    const header = req.headers["x-sensei-token"];
    const presented = Array.isArray(header) ? header[0] : header;
    return typeof presented === "string" && presented.length === token.length && crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(token));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = (req.url ?? "").split("?")[0];
    if (!url.startsWith("/api/tutor/")) return false;

    if (url === "/api/tutor/status") {
      sendJson(res, 200, await status());
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return true;
    }
    if (!authorized(req)) {
      sendJson(res, 401, { ok: false, error: "Missing or invalid X-Sensei-Token. Open the app via the URL printed by the server." });
      return true;
    }

    try {
      const body = await readJsonBody(req);
      const ctx = learnerContext(body);

      if (url === "/api/tutor/explain") {
        const out = await pick(body).explainMiss({
          ...ctx,
          itemId: str(body.itemId, 120),
          variantKey: body.variantKey ? str(body.variantKey, 160) : undefined,
          input: str(body.input, 120),
          expected: body.expected ? str(body.expected, 120) : undefined,
          promptText: body.promptText ? str(body.promptText, 200) : undefined,
        });
        sendJson(res, 200, { ok: true, result: out.result, conversationId: out.conversationId, model: creds?.model ?? null });
        return true;
      }

      if (url === "/api/tutor/fix") {
        const missed = Array.isArray(body.missed)
          ? body.missed.slice(0, 30).map((m) => {
              const x = (m ?? {}) as Record<string, unknown>;
              return { itemId: str(x.itemId, 120), input: str(x.input, 120), expected: str(x.expected, 120), trapId: x.trapId ? str(x.trapId, 60) : undefined };
            })
          : [];
        const out = await pick(body).whatToFix({ ...ctx, missed, unitTitle: str(body.unitTitle, 120) });
        sendJson(res, 200, { ok: true, result: out.result, conversationId: out.conversationId, model: creds?.model ?? null });
        return true;
      }

      if (url === "/api/tutor/compose") {
        const n = Math.min(20, Math.max(4, Number(body.n) || 10));
        const out = await pick(body).composeSet({ ...ctx, n });
        sendJson(res, 200, { ok: true, result: out.result, conversationId: out.conversationId, model: creds?.model ?? null });
        return true;
      }

      if (url === "/api/tutor/chat") {
        if (!creds) {
          sendJson(res, 503, {
            ok: false,
            error:
              "Live Sensei is not configured. Set WANDB_API_KEY (or run `wandb login`) for Forge Inference, or set OPENAI_API_KEY. Deterministic Sensei drills remain fully available.",
          });
          return true;
        }
        const history = Array.isArray(body.history)
          ? body.history.slice(-8).map((m) => {
              const item = (m ?? {}) as { role?: string; content?: string };
              return { role: item.role === "assistant" ? ("assistant" as const) : ("user" as const), content: str(item.content, 500) };
            })
          : [];
        const common = { ...ctx, userMessage: str(body.userMessage), allowedGrammar: strList(body.allowedGrammar, 24), history };
        if (body.mode === "grade" || body.task === "grade") {
          const out = await pick(body).gradeTyped(common);
          sendJson(res, 200, { ok: true, model: creds.model, result: out.result, conversationId: out.conversationId });
        } else {
          const out = await pick(body).roleplayTurn({
            ...common,
            scenarioTitle: str(body.scenarioTitle, 120) || "Genki Lesson 1-2 Practice",
            allowedVocab: strList(body.allowedVocab, 80),
          });
          sendJson(res, 200, { ok: true, model: creds.model, result: out.result, conversationId: out.conversationId });
        }
        return true;
      }

      sendJson(res, 404, { ok: false, error: "Unknown tutor route" });
      return true;
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : "Tutor request failed" });
      return true;
    }
  }

  return { handle, token, creds, sensei, tracer };
}
