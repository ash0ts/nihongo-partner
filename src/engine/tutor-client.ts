import type { ExerciseSet } from "./composer";
import type {
  ComposeSetRequest,
  ExplainMissRequest,
  ExplainMissResult,
  TutorEnvelope,
  TutorStatus,
  WhatToFixRequest,
  WhatToFixResult,
} from "./tutor-types";

/**
 * Browser-side client for the Sensei agent. Static builds (GitHub Pages) have no
 * `/api/tutor`, so every call degrades to `null` and the UI hides itself.
 *
 * Token: `pnpm sensei` / `pnpm dev:phone` print a URL with `?sensei=<token>`; we lift it
 * into sessionStorage once and send it as `X-Sensei-Token` on every POST.
 */
const TOKEN_KEY = "nihongo-partner.sensei-token";

function captureToken(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("sensei");
    if (t) {
      window.sessionStorage.setItem(TOKEN_KEY, t);
      url.searchParams.delete("sensei");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    // ignore
  }
}

function token(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

captureToken();

function base(): string {
  // The dev server mounts /api at the origin root regardless of Vite `base`.
  return "";
}

export async function fetchTutorStatus(): Promise<TutorStatus | null> {
  try {
    const r = await fetch(`${base()}/api/tutor/status`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null; // static host returned index.html
    const data = (await r.json()) as Partial<TutorStatus>;
    return typeof data.available === "boolean" ? (data as TutorStatus) : null;
  } catch {
    return null;
  }
}

export async function tutorPost<TReq, TRes>(path: string, body: TReq): Promise<TutorEnvelope<TRes>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers["X-Sensei-Token"] = t;
  try {
    const r = await fetch(`${base()}/api/tutor/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const data = (await r.json()) as TutorEnvelope<TRes>;
    if (!r.ok) return { ok: false, error: data.error ?? `HTTP ${r.status}` };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export const explainMiss = (req: ExplainMissRequest) => tutorPost<ExplainMissRequest, ExplainMissResult>("explain", req);
export const whatToFix = (req: WhatToFixRequest) => tutorPost<WhatToFixRequest, WhatToFixResult>("fix", req);
export const composeSet = (req: ComposeSetRequest) => tutorPost<ComposeSetRequest, ExerciseSet>("compose", req);
