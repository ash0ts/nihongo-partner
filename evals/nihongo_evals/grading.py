"""Grading eval: deterministic `grade()` vs LLM (bare prompt) vs LLM (with phonetic facts).

Cases come from `evals/datasets/grading-cases.jsonl` (see scripts/export-eval-cases.ts).
Truth for drill items is the rule-based grader; truth for free sentences is hand-labelled.
Results are logged as a `wandb.EvalTable` so the three systems sit side by side per case,
with accuracy per system, per case kind, and per trap in the run summary.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from .common import DATASETS_DIR, DEFAULT_PROJECT, ensure_sensei, log, read_jsonl, write_jsonl

SYSTEMS = ("deterministic", "llm_bare", "llm_facts")


def user_message(case: dict) -> str:
    if case["kind"] == "sentence":
        return case["input"]
    prompt = case["prompt"]
    instr = case.get("promptEn") or "Type the Japanese."
    return f"Drill question: {prompt}\nInstruction: {instr}\nMy typed answer: {case['input']}\nIs my answer correct for this question?"


def grade_with_llm(server, case: dict, variant: str) -> dict:
    body = {
        "task": "grade",
        "promptVariant": variant,
        "sessionId": f"eval-grading-{variant}-{case['id']}",
        "displayMode": case["mode"],
        "persona": "eval",
        "userMessage": user_message(case),
        "allowedGrammar": ["X wa Y desu", "X ja nai desu", "kore/sore/are/dore", "kono/sono/ano/dono", "numbers, time, age, yen"],
    }
    try:
        res = server.post("chat", body)
        result = res.get("result") or {}
        return {"correct": bool(result.get("correct")), "feedback": result.get("feedback", ""), "japanese": result.get("japanese", ""), "error": None}
    except Exception as err:  # noqa: BLE001 - surface the error as a row, keep the eval going
        return {"correct": None, "feedback": "", "japanese": "", "error": str(err)[:200]}


def run(args: argparse.Namespace) -> int:
    cases = read_jsonl(DATASETS_DIR / "grading-cases.jsonl")
    if args.limit:
        cases = cases[: args.limit]
    log(f"{len(cases)} grading cases")

    rows: list[dict] = []
    if args.dry_run:
        for c in cases:
            det = c["truthCorrect"] if c["kind"] != "sentence" else None
            rows.append({**c, "deterministic": det, "llm_bare": None, "llm_facts": None})
        acc = sum(1 for r in rows if r["deterministic"] == r["truthCorrect"]) / max(1, sum(1 for r in rows if r["deterministic"] is not None))
        log(f"dry run: deterministic agreement with truth on item cases = {acc:.3f} (by construction)")
        return 0

    server = ensure_sensei(spawn=not args.no_spawn, tracing=not args.no_trace)
    try:
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            bare = list(pool.map(lambda c: grade_with_llm(server, c, "bare"), cases))
            facts = list(pool.map(lambda c: grade_with_llm(server, c, "facts"), cases))
    finally:
        server.close()

    for c, b, f in zip(cases, bare, facts):
        rows.append(
            {
                "id": c["id"],
                "kind": c["kind"],
                "mode": c["mode"],
                "trap_id": c.get("trapId"),
                "prompt": c["prompt"],
                "input": c["input"],
                "expected": c["expected"],
                "truth": c["truthCorrect"],
                "deterministic": c["truthCorrect"] if c["kind"] != "sentence" else None,
                "llm_bare": b["correct"],
                "llm_facts": f["correct"],
                "llm_bare_feedback": b["feedback"],
                "llm_facts_feedback": f["feedback"],
                "deterministic_ok": (c["kind"] != "sentence") or None,
                "llm_bare_ok": None if b["correct"] is None else b["correct"] == c["truthCorrect"],
                "llm_facts_ok": None if f["correct"] is None else f["correct"] == c["truthCorrect"],
                "error": b["error"] or f["error"],
            }
        )

    summary = summarize(rows)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    out = DATASETS_DIR.parent / "out" / "grading-results.jsonl"
    write_jsonl(out, rows)
    log(f"wrote {out}")

    if args.no_wandb:
        return 0
    import wandb

    entity, project = args.project.split("/")
    run = wandb.init(entity=entity, project=project, job_type="eval-grading", config={"systems": SYSTEMS, "cases": len(cases), "model": server.status() and server.status().get("model")})
    table = wandb.EvalTable(
        columns=list(rows[0].keys()),
        data=[list(r.values()) for r in rows],
        input_columns=["id", "kind", "mode", "trap_id", "prompt", "input", "expected", "truth"],
        output_columns=["deterministic", "llm_bare", "llm_facts", "llm_bare_feedback", "llm_facts_feedback"],
        score_columns=["deterministic_ok", "llm_bare_ok", "llm_facts_ok"],
    )
    run.log({"grading": table})
    for k, v in summary.items():
        run.summary[k] = v
    run.finish()
    log(f"logged EvalTable -> {run.url}")
    return 0


def summarize(rows: list[dict]) -> dict:
    def acc(key: str, subset: list[dict]) -> float | None:
        scored = [r for r in subset if r[key] is not None]
        return round(sum(1 for r in scored if r[key]) / len(scored), 3) if scored else None

    out: dict = {}
    for sys_name in SYSTEMS:
        out[f"{sys_name}/accuracy"] = acc(f"{sys_name}_ok", rows)
        for kind in sorted({r["kind"] for r in rows}):
            out[f"{sys_name}/accuracy/{kind}"] = acc(f"{sys_name}_ok", [r for r in rows if r["kind"] == kind])
    by_trap: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r.get("trap_id"):
            by_trap[r["trap_id"]].append(r)
    out["per_trap"] = {t: {"n": len(rs), "llm_bare": acc("llm_bare_ok", rs), "llm_facts": acc("llm_facts_ok", rs)} for t, rs in sorted(by_trap.items())}
    out["errors"] = sum(1 for r in rows if r.get("error"))
    return out


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("grading", help="Compare deterministic grade() with LLM grading (bare vs facts prompt)")
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--dry-run", action="store_true", help="No server, no LLM, no wandb: just validate the cases")
    p.add_argument("--no-spawn", action="store_true", help="Fail instead of starting `pnpm sensei`")
    p.add_argument("--no-trace", action="store_true", help="Spawn the server with Agent Lens tracing off")
    p.add_argument("--no-wandb", action="store_true", help="Skip logging the EvalTable")
    p.set_defaults(func=run)
