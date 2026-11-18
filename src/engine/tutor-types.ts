import type { DisplayMode } from "../content/schema";
import type { InteractionEvent } from "./events";

/**
 * Request/response shapes shared by the browser client (`tutor-client.ts`), the Sensei
 * agent (`server/agent`), and the simulator (`sim/`). Plain JSON only.
 */

export interface TutorStatus {
  available: boolean;
  provider: string | null;
  model: string | null;
  tracing: boolean;
  project: string | null;
  /** True when the server will insist on X-Sensei-Token for non-loopback callers. */
  tokenRequired: boolean;
}

export interface LearnerContext {
  sessionId: string;
  mode: DisplayMode;
  unitId?: string;
  /** Recent events (the client sends the tail of its log; the agent summarises them). */
  recentEvents?: InteractionEvent[];
  /** Synthetic persona id, set only by the simulator. */
  persona?: string;
  /** Stable anonymous learner id (one person across sessions). The simulator sets it; the app sends its random install id. */
  learnerId?: string;
  /** Batch label for simulated traffic (e.g. "pop-21-2026-11-18"), so one run can be filtered out or compared. */
  cohort?: string;
}

export interface ExplainMissRequest extends LearnerContext {
  itemId: string;
  variantKey?: string;
  input: string;
  /** Fallbacks when the item id is not in the study path (reference tabs). */
  expected?: string;
  promptText?: string;
}

export interface ExplainMissResult {
  explanation: string;
  trapId?: string;
  trapLabel?: string;
  rule?: string;
  /** "llm" when a model wrote the explanation; "deterministic" when the catalog rule was used. */
  source: "llm" | "deterministic";
}

export interface GradeRequest extends LearnerContext {
  userMessage: string;
  allowedGrammar: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface GradeResult {
  correct: boolean;
  japanese: string;
  reading: string;
  feedback: string;
  trapNote: string;
  trapId?: string;
}

export interface RoleplayRequest extends LearnerContext {
  userMessage: string;
  scenarioTitle: string;
  allowedGrammar: string[];
  allowedVocab: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface RoleplayResult {
  replyJp: string;
  replyKana: string;
  replyEn: string;
  coachTip: string;
}

export interface WhatToFixRequest extends LearnerContext {
  /** Items missed in the checkpoint just finished. */
  missed: Array<{ itemId: string; input: string; expected: string; trapId?: string }>;
  unitTitle: string;
}

export interface WhatToFixResult {
  summary: string;
  focusTrapIds: string[];
  source: "llm" | "deterministic";
}

export interface ComposeSetRequest extends LearnerContext {
  /** Number of items in the set (server clamps to 4..20). */
  n?: number;
}

export interface TutorEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
  model?: string;
  conversationId?: string;
}
