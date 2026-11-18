import type { Message } from "@coreweave/forge-sdk/agentlens/tracing";
import { ALL_GRAMMAR } from "../../src/content/index";
import { STUDY_PATH } from "../../src/content/study-path";
import { type DrillItem, grade } from "../../src/engine/drills";
import { type InteractionEvent, summarizeTraps, trailingMissStreak } from "../../src/engine/events";
import { selectDrillItems, type StudyPath } from "../../src/engine/path";
import { katakanaToHiragana, romajiToHiragana } from "../../src/engine/romaji-kana";
import { createEmptySnapshot } from "../../src/engine/srs";
import { getTrap, trapForItem } from "../../src/engine/traps";
import type {
  ExplainMissRequest,
  ExplainMissResult,
  GradeRequest,
  GradeResult,
  LearnerContext,
  RoleplayRequest,
  RoleplayResult,
  WhatToFixRequest,
  WhatToFixResult,
} from "../../src/engine/tutor-types";
import type { TutorCredentials } from "../credentials";
import { chatCompletion, parseJsonObject } from "../llm";
import { AGENT_VERSION, type TraceRunner, type TurnTrace } from "../tracing";
import type { ExerciseSet } from "../../src/engine/composer";
import { acceptRationale, type ComposeRequest, composeTool, rationalePrompt } from "./composer";

/**
 * The Sensei agent. Three entry points (grade, roleplay, explain-a-miss) plus a
 * post-checkpoint "what to fix" summary. The harness decides which tools to run and in
 * what order, records each as an `execute_tool` span, then makes one LLM call with the
 * tool results in context. With no credentials the deterministic paths still answer
 * (`source: "deterministic"`) so the app never depends on a model being reachable.
 */

export const PHONETIC_FACTS =
  "CRITICAL PHONETIC FACTS: 4th-year student IS よねんせい (yonensei, NOT yonnensei); 4:00 IS よじ; 7:00 IS しちじ; 9:00 IS くじ; 20 years old IS はたち; 300/600/800 = さんびゃく/ろっぴゃく/はっぴゃく; 3000/8000 = さんぜん/はっせん; minutes 1,3,4,6,8,10 take ぷん; over there = あそこ.";

export interface SenseiOptions {
  creds: TutorCredentials | null;
  tracer: TraceRunner;
  path?: StudyPath;
  /** Prompt variant for A/B evals: "facts" (default) includes PHONETIC_FACTS, "bare" omits it. */
  promptVariant?: "facts" | "bare";
}

export interface LearnerState {
  mode: string;
  missStreak: number;
  topTraps: Array<{ trapId: string; label: string; missRate: number; misses: number; attempts: number }>;
  recentMisses: Array<{ itemId: string; input: string; expected: string }>;
  eventCount: number;
}

export function summarizeLearner(ctx: LearnerContext): LearnerState {
  const events: InteractionEvent[] = ctx.recentEvents ?? [];
  const traps = summarizeTraps(events)
    .filter((t) => t.misses > 0)
    .slice(0, 5)
    .map((t) => ({ trapId: t.trapId, label: getTrap(t.trapId)?.label ?? t.trapId, missRate: Math.round(t.missRate * 100) / 100, misses: t.misses, attempts: t.attempts }));
  const recentMisses = events
    .filter((e) => !e.correct)
    .slice(-5)
    .map((e) => ({ itemId: e.itemId, input: e.input, expected: e.expected }));
  return { mode: ctx.mode, missStreak: trailingMissStreak(events), topTraps: traps, recentMisses, eventCount: events.length };
}

const MODE_RULE: Record<string, string> = {
  bridge: "The learner is in Romaji Bridge mode: you MAY include romaji in parentheses after kana.",
  classroom: "The learner is in Classroom mode (Genki Lesson 3 format): write Japanese in kana only. NO romaji anywhere.",
  immersion: "The learner is in Immersion mode: write Japanese in kana only. NO romaji anywhere.",
};

/**
 * True when `text` spells no Japanese word in Latin letters. A Latin token counts as romaji
 * when it converts cleanly to kana and that kana appears in the reply or in `kanaContext`
 * (the expected answer and the learner's input). English words fail the conversion or
 * produce kana that is not present, so prose is not penalised.
 */
const META_WORDS = new Set(["kana", "hiragana", "katakana", "kanji", "romaji", "genki", "sensei", "dakuten", "handakuten", "sokuon", "furigana", "yoon"]);

export function romajiFree(text: string, kanaContext = ""): boolean {
  const kanaPresent = katakanaToHiragana(`${text} ${kanaContext}`);
  for (const token of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    if (META_WORDS.has(token)) continue;
    const kana = romajiToHiragana(token);
    if (kana.length === 0 || /[a-z]/.test(kana)) continue;
    if (kanaPresent.includes(kana)) return false;
  }
  return true;
}

export function createSensei(opts: SenseiOptions) {
  const path = opts.path ?? STUDY_PATH;
  const variant = opts.promptVariant ?? "facts";
  const itemIndex = new Map<string, DrillItem>();
  for (const u of path.units) for (const it of [...u.drillItems, ...u.checkpointPool]) if (!itemIndex.has(it.id)) itemIndex.set(it.id, it);

  const facts = variant === "facts" ? [PHONETIC_FACTS] : [];
  const model = opts.creds?.model ?? "deterministic";

  function baseAttrs(ctx: LearnerContext, task: string, extra: Record<string, string | number | boolean | undefined> = {}) {
    return {
      "nihongo.task": task,
      "nihongo.mode": ctx.mode,
      "nihongo.unit_id": ctx.unitId,
      "nihongo.persona": ctx.persona,
      "nihongo.agent_version": AGENT_VERSION,
      "nihongo.prompt_variant": variant,
      ...extra,
    };
  }

  async function callModel<T extends Record<string, unknown>>(
    trace: TurnTrace,
    system: string[],
    user: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    temperature = 0.3,
  ): Promise<{ parsed: T; raw: string } | null> {
    if (!opts.creds) return null;
    const creds = opts.creds;
    const input: Message[] = [
      ...history.map((h) => ({ role: h.role, parts: [{ type: "text" as const, content: h.content }] })),
      { role: "user", parts: [{ type: "text", content: user }] },
    ];
    const res = await trace.llm(
      creds.model,
      input,
      system,
      () =>
        chatCompletion(
          creds,
          [{ role: "system", content: system.join("\n") }, ...history, { role: "user", content: user }],
          { temperature, maxTokens: 600 },
        ),
      (r) => ({ output: r.content, inputTokens: r.inputTokens, outputTokens: r.outputTokens, responseModel: r.model }),
    );
    return { parsed: parseJsonObject(res.content) as T, raw: res.content };
  }

  /* ------------------------------------------------------------------------------------ */
  /* Tools (each is traced as execute_tool)                                                  */
  /* ------------------------------------------------------------------------------------ */

  const tools = {
    getLearnerState: (trace: TurnTrace, ctx: LearnerContext) =>
      trace.tool("get_learner_state", { sessionId: ctx.sessionId, unitId: ctx.unitId ?? null, events: ctx.recentEvents?.length ?? 0 }, () =>
        JSON.parse(JSON.stringify(summarizeLearner(ctx))),
      ),
    lookupItem: (trace: TurnTrace, itemId: string) =>
      trace.tool("lookup_item", { itemId }, () => {
        const it = itemIndex.get(itemId);
        if (!it) return null;
        return {
          id: it.id,
          skill: it.skill,
          prompt: it.prompt.text ?? it.prompt.segments?.map((s) => s.text).join("") ?? "",
          promptEn: it.prompt.en ?? "",
          answer: it.answerDisplay,
          acceptedKana: it.acceptedKana,
          explanation: it.explanation,
          trapWarning: it.trapWarning ?? null,
        };
      }),
    gradeAnswer: (trace: TurnTrace, item: DrillItem, input: string) =>
      trace.tool("grade_answer", { itemId: item.id, input }, () => ({ correct: grade(item, input), expected: item.answerDisplay })),
    lookupRule: (trace: TurnTrace, trapId: string | undefined, grammarCode?: string) =>
      trace.tool("lookup_rule", { trapId: trapId ?? null, grammarCode: grammarCode ?? null }, () => {
        const trap = trapId ? getTrap(trapId) : undefined;
        const g = grammarCode ? ALL_GRAMMAR.find((x) => x.code === grammarCode || x.id === grammarCode) : undefined;
        return {
          trap: trap ? { id: trap.id, label: trap.label, rule: trap.rule } : null,
          grammar: g ? { code: g.code, formula: g.formula, traps: g.traps } : null,
        };
      }),
    selectDrillItems: (trace: TurnTrace, unitId: string, n: number) =>
      trace.tool("select_drill_items", { unitId, n }, () => {
        const unit = path.units.find((u) => u.id === unitId);
        if (!unit) return [];
        return selectDrillItems(unit, createEmptySnapshot(), 0)
          .slice(0, n)
          .map((it) => ({ id: it.id, skill: it.skill, answer: it.answerDisplay }));
      }),
  };

  /* ------------------------------------------------------------------------------------ */
  /* Entry points                                                                           */
  /* ------------------------------------------------------------------------------------ */

  async function explainMiss(req: ExplainMissRequest): Promise<{ result: ExplainMissResult; conversationId: string }> {
    const item = itemIndex.get(req.itemId);
    const trap = item ? trapForItem(item) : undefined;
    return opts.tracer.run(
      {
        conversationId: req.sessionId,
        userMessage: `Why was "${req.input}" wrong for ${req.itemId}?`,
        model,
        attributes: baseAttrs(req, "explain_miss", { "nihongo.item_id": req.itemId, "nihongo.trap_id": trap?.id }),
      },
      async (trace) => {
        const state = await tools.getLearnerState(trace, req);
        const looked = await tools.lookupItem(trace, req.itemId);
        const expected = looked?.answer ?? req.expected ?? "";
        const promptText = looked?.prompt ?? req.promptText ?? "";
        if (item) await tools.gradeAnswer(trace, item, req.input);
        const rule = await tools.lookupRule(trace, trap?.id);

        const deterministic: ExplainMissResult = {
          explanation: trap
            ? `You wrote ${req.input}; the answer is ${expected}. ${trap.rule}`
            : `You wrote ${req.input}; the answer is ${expected}. ${looked?.explanation ?? ""}`.trim(),
          trapId: trap?.id,
          trapLabel: trap?.label,
          rule: trap?.rule,
          source: "deterministic",
        };

        const system = [
          "You are a concise Japanese Sensei helping a student cram Genki I Lessons 0-2. The student just answered a drill item wrong.",
          "Explain the specific confusion in under 40 words of plain ENGLISH: contrast what they wrote with the correct answer and say why. No praise, no filler.",
          "Ground every fact in `itemExplanation` and `knownTrap`: reuse their mnemonic or rule in your own words. Never describe kana stroke shapes or give readings that are not in those fields.",
          MODE_RULE[req.mode] ?? MODE_RULE.classroom,
          ...facts,
          'Return JSON ONLY: {"explanation": string}.',
        ];
        const user = JSON.stringify({
          prompt: promptText,
          promptInstruction: looked?.promptEn ?? "",
          learnerWrote: req.input,
          correctAnswer: expected,
          itemExplanation: looked?.explanation ?? "",
          itemWarning: looked?.trapWarning ?? null,
          knownTrap: rule.trap,
          learnerState: { missStreak: state.missStreak, topTraps: state.topTraps.slice(0, 3) },
        });
        const llm = await callModel<{ explanation?: string }>(trace, system, user);
        const text = typeof llm?.parsed.explanation === "string" ? llm.parsed.explanation.trim() : "";
        // Kana-reading items are graded in romaji, so saying `む is "mu"` is the lesson, not a leak.
        const romajiIsTheAnswer = item?.skill === "kana-read";
        const useLlm = text.length > 0 && (req.mode === "bridge" || romajiIsTheAnswer || romajiFree(text, `${expected} ${req.input}`));
        const result: ExplainMissResult = useLlm ? { ...deterministic, explanation: text, source: "llm" } : deterministic;
        trace.setAttributes({
          "nihongo.source": result.source,
          "nihongo.words": result.explanation.split(/\s+/).length,
          "nihongo.names_trap": trap ? result.explanation.toLowerCase().includes(trap.label.split(" ")[0].toLowerCase()) || result.explanation.includes(expected) : false,
        });
        trace.output(result.explanation);
        return { result, conversationId: trace.conversationId };
      },
    );
  }

  async function gradeTyped(req: GradeRequest): Promise<{ result: GradeResult; conversationId: string }> {
    return opts.tracer.run(
      {
        conversationId: req.sessionId,
        userMessage: req.userMessage,
        model,
        attributes: baseAttrs(req, "grade_sentence"),
      },
      async (trace) => {
        await tools.getLearnerState(trace, req);
        const system = [
          "You are a concise, accurate Japanese Sensei grading a student cramming Genki I Lessons 0-2 before starting Lesson 3.",
          "Stay strictly inside beginner polite Japanese (desu / janai desu, wa/ka/no/mo/ne/yo, ko-so-a-do, numbers/time/age/yen).",
          ...facts,
          `Unlocked grammar patterns: ${req.allowedGrammar.join("; ")}`,
          MODE_RULE[req.mode] ?? MODE_RULE.bridge,
          'Return JSON ONLY with keys: {"correct": boolean, "japanese": string, "reading": string, "feedback": string, "trapNote": string}.',
          "Write `feedback` and `trapNote` in clear, direct ENGLISH (under 40 words each). In `japanese`, give the natural polite Japanese sentence, and in `reading` give its pure hiragana/katakana reading.",
        ];
        const llm = await callModel<Partial<GradeResult>>(trace, system, req.userMessage, req.history ?? []);
        if (!llm) throw new Error("Live Sensei is not configured.");
        const p = llm.parsed;
        const result: GradeResult = {
          correct: Boolean(p.correct),
          japanese: String(p.japanese ?? ""),
          reading: String(p.reading ?? ""),
          feedback: String(p.feedback ?? ""),
          trapNote: String(p.trapNote ?? ""),
        };
        trace.setAttributes({ "nihongo.graded_correct": result.correct });
        trace.output(result.feedback || result.japanese);
        return { result, conversationId: trace.conversationId };
      },
    );
  }

  async function roleplayTurn(req: RoleplayRequest): Promise<{ result: RoleplayResult; conversationId: string }> {
    return opts.tracer.run(
      {
        conversationId: req.sessionId,
        userMessage: req.userMessage,
        model,
        attributes: baseAttrs(req, "roleplay", { "nihongo.scenario": req.scenarioTitle }),
      },
      async (trace) => {
        await tools.getLearnerState(trace, req);
        const system = [
          `You are roleplaying a friendly Japanese conversation partner in scenario: ${req.scenarioTitle}.`,
          "Constrain your Japanese strictly to Genki I Lessons 0-2 polite speech (plus simple classroom survival phrases). Never use casual plain forms.",
          ...facts,
          `Unlocked grammar: ${req.allowedGrammar.join("; ")}`,
          `Key vocabulary pool: ${req.allowedVocab.join(", ")}`,
          MODE_RULE[req.mode] ?? MODE_RULE.bridge,
          'Return JSON ONLY with keys: {"replyJp": string, "replyKana": string, "replyEn": string, "coachTip": string}.',
          "`replyJp` must be 1-2 short natural polite Japanese sentences continuing the conversation and ending with an easy question. Write `replyEn` and `coachTip` in clear ENGLISH (`coachTip` under 35 words).",
        ];
        const llm = await callModel<Partial<RoleplayResult>>(trace, system, req.userMessage, req.history ?? [], 0.5);
        if (!llm) throw new Error("Live Sensei is not configured.");
        const p = llm.parsed;
        const result: RoleplayResult = {
          replyJp: String(p.replyJp ?? ""),
          replyKana: String(p.replyKana ?? ""),
          replyEn: String(p.replyEn ?? ""),
          coachTip: String(p.coachTip ?? ""),
        };
        trace.output(result.replyJp);
        return { result, conversationId: trace.conversationId };
      },
    );
  }

  async function whatToFix(req: WhatToFixRequest): Promise<{ result: WhatToFixResult; conversationId: string }> {
    return opts.tracer.run(
      {
        conversationId: req.sessionId,
        userMessage: `What should I fix after ${req.unitTitle}? Missed ${req.missed.length}.`,
        model,
        attributes: baseAttrs(req, "what_to_fix", { "nihongo.missed": req.missed.length }),
      },
      async (trace) => {
        const state = await tools.getLearnerState(trace, req);
        const trapIds = Array.from(new Set(req.missed.map((m) => m.trapId).filter((x): x is string => Boolean(x))));
        const rules = await Promise.all(trapIds.map((t) => tools.lookupRule(trace, t)));
        const labels = rules.map((r) => r.trap).filter((t): t is { id: string; label: string; rule: string } => Boolean(t));
        const deterministic: WhatToFixResult = {
          summary:
            labels.length > 0
              ? `Focus on: ${labels.map((l) => l.label).join("; ")}. ${labels[0].rule}`
              : `You missed ${req.missed.length}: ${req.missed.map((m) => m.expected).slice(0, 4).join(", ")}. Retry those, then retake.`,
          focusTrapIds: trapIds,
          source: "deterministic",
        };
        const system = [
          "You are a concise Japanese Sensei. The student just finished a checkpoint and missed some items.",
          "In under 45 words of plain ENGLISH, name the one or two confusions behind the misses and say what to practise next. No praise, no filler.",
          "Ground every fact in each miss's `explanation` and in `knownTraps`. Never describe kana stroke shapes or state readings that are not in those fields.",
          MODE_RULE[req.mode] ?? MODE_RULE.classroom,
          ...facts,
          'Return JSON ONLY: {"summary": string}.',
        ];
        const missedWithRules = await Promise.all(
          req.missed.slice(0, 8).map(async (m) => {
            const looked = await tools.lookupItem(trace, m.itemId);
            return { ...m, explanation: looked?.explanation ?? "" };
          }),
        );
        const user = JSON.stringify({ unit: req.unitTitle, missed: missedWithRules, knownTraps: labels, learnerState: state });
        const llm = await callModel<{ summary?: string }>(trace, system, user);
        const text = typeof llm?.parsed.summary === "string" ? llm.parsed.summary.trim() : "";
        const result: WhatToFixResult = text ? { ...deterministic, summary: text, source: "llm" } : deterministic;
        trace.setAttributes({ "nihongo.source": result.source });
        trace.output(result.summary);
        return { result, conversationId: trace.conversationId };
      },
    );
  }

  async function composeSet(req: ComposeRequest): Promise<{ result: ExerciseSet; conversationId: string }> {
    return opts.tracer.run(
      {
        conversationId: req.sessionId,
        userMessage: `Compose a ${req.n ?? 10}-item set from my last ${req.recentEvents?.length ?? 0} answers.`,
        model,
        attributes: baseAttrs(req, "compose_set", { "nihongo.events": req.recentEvents?.length ?? 0 }),
      },
      async (trace) => {
        await tools.getLearnerState(trace, req);
        const set = await composeTool(trace, path, req);
        const { system, user } = rationalePrompt(set);
        const llm = await callModel<{ rationale?: string }>(trace, [...system, MODE_RULE[req.mode] ?? MODE_RULE.classroom], user);
        const result = acceptRationale(set, typeof llm?.parsed.rationale === "string" ? llm.parsed.rationale : undefined);
        trace.setAttributes({
          "nihongo.source": result.source,
          "nihongo.set_items": result.items.length,
          "nihongo.set_rules": result.rules.join(","),
          "nihongo.trap_id": result.facts.topTraps[0]?.trapId,
        });
        trace.output(result.rationale);
        return { result, conversationId: trace.conversationId };
      },
    );
  }

  return { explainMiss, gradeTyped, roleplayTurn, whatToFix, composeSet, itemIndex, tools };
}

export type Sensei = ReturnType<typeof createSensei>;
