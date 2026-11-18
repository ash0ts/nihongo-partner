"""Feedback eval: score Sensei's `explain_miss` and `what_to_fix` replies from the frozen sim run.

Four checks, mirroring the Agent Lens tags so a tag rate seen in production can be reproduced
offline:
  names_trap     the reply names the catalogued confusion (deterministic label match, then judge)
  mode_ok        no romaji in classroom/immersion replies (deterministic + judge)
  under_40_words length budget from the system prompt
  english        the explanation is English prose (deterministic)
  reading_ok     the judge found no incorrect Japanese reading in the reply

`--dry-run` runs only the deterministic checks and logs nothing; `--judge` adds the LLM judge
and logs a `wandb.EvalTable`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from .common import DATASETS_DIR, DEFAULT_PROJECT, JUDGE_MODEL, judge_client, judge_json, log, looks_english, names_trap, read_jsonl, romaji_leak, word_count, write_jsonl

JUDGE_SYSTEM = """You audit short replies from a Japanese tutor for Genki I Lessons 0-2 learners.
Answer JSON ONLY: {"names_trap": bool, "mode_ok": bool, "reading_ok": bool, "in_scope": bool, "note": string}.
- names_trap: the reply identifies the specific confusion the learner made (not just restating the answer).
- mode_ok: if mode is classroom or immersion, the reply spells Japanese in kana, never romaji. In bridge mode this is always true.
- reading_ok: every Japanese reading or fact stated is correct (yoji, shichiji, kuji, hatachi, sanbyaku, roppyaku, happyaku, topic particle written は).
- in_scope: nothing beyond Lessons 0-2. All kana are in scope (hiragana, katakana, dakuten, small っ, long vowels, loanwords); out of scope means verbs, adjectives, particles besides は/か/の/も/ね/よ, or kanji beyond digits.
Keep note under 20 words."""


def load_traps() -> dict[str, dict]:
    path = DATASETS_DIR / "traps.json"
    if not path.exists():
        return {}
    return {t["id"]: t for t in json.loads(path.read_text(encoding="utf-8"))}


def load_items() -> dict[str, dict]:
    path = DATASETS_DIR / "items.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


ITEMS = load_items()


def deterministic_scores(row: dict, traps: dict[str, dict]) -> dict:
    result = row["result"]
    text = result.get("explanation") or result.get("summary") or ""
    trap = traps.get(row.get("trapId") or "")
    # Kana-reading drills are answered in romaji, so romaji in the explanation is the lesson itself.
    kana_reading_item = ITEMS.get(str(row.get("itemId") or ""), {}).get("skill") == "kana-read"
    return {
        "text": text,
        "words": word_count(text),
        "under_40_words": word_count(text) <= 40 if row["task"] == "explain_miss" else word_count(text) <= 60,
        "english": looks_english(text),
        "romaji_leak": False if kana_reading_item else romaji_leak(text, row["mode"], f"{row.get('expected') or ''} {row.get('input') or ''}"),
        "names_trap_det": names_trap(text, trap["label"] if trap else None, row.get("expected") or ""),
    }


def judge_row(client, row: dict, det: dict, traps: dict[str, dict]) -> dict:
    trap = traps.get(row.get("trapId") or "")
    user = json.dumps(
        {
            "task": row["task"],
            "mode": row["mode"],
            "learner_wrote": row.get("input"),
            "correct_answer": row.get("expected"),
            "known_trap": {"label": trap["label"], "rule": trap["rule"]} if trap else None,
            "tutor_reply": det["text"],
        },
        ensure_ascii=False,
    )
    try:
        verdict = judge_json(client, JUDGE_SYSTEM, user)
    except Exception as err:  # noqa: BLE001
        verdict = {"note": f"judge error: {str(err)[:80]}"}
    return {
        "names_trap_judge": verdict.get("names_trap"),
        "mode_ok_judge": verdict.get("mode_ok"),
        "reading_ok": verdict.get("reading_ok"),
        "in_scope": verdict.get("in_scope"),
        "judge_note": verdict.get("note", ""),
    }


def run(args: argparse.Namespace) -> int:
    traps = load_traps()
    dataset_path = Path(args.dataset) if "/" in args.dataset else DATASETS_DIR / args.dataset
    outputs = [r for r in read_jsonl(dataset_path) if r["task"] in ("explain_miss", "what_to_fix") and r["result"].get("source") == "llm"]
    if args.limit:
        outputs = outputs[: args.limit]
    log(f"{len(outputs)} LLM-written replies to score ({len(traps)} traps known)")

    rows = []
    for o in outputs:
        det = deterministic_scores(o, traps)
        rows.append(
            {
                "sessionId": o["sessionId"],
                "persona": o["persona"],
                "task": o["task"],
                "mode": o["mode"],
                "trap_id": o.get("trapId"),
                "item_id": o.get("itemId"),
                "input": o.get("input"),
                "expected": o.get("expected"),
                "reply": det["text"],
                "words": det["words"],
                "under_40_words": det["under_40_words"],
                "english": det["english"],
                "mode_ok_det": not det["romaji_leak"],
                "names_trap_det": det["names_trap_det"],
            }
        )

    if not args.dry_run:
        client = judge_client(args.project)
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            verdicts = list(pool.map(lambda pair: judge_row(client, pair[0], deterministic_scores(pair[0], traps), traps), zip(outputs, rows)))
        for r, v in zip(rows, verdicts):
            r.update(v)

    summary = summarize(rows, judged=not args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    out = DATASETS_DIR.parent / "out" / "feedback-results.jsonl"
    write_jsonl(out, rows)
    log(f"wrote {out}")

    if args.dry_run or args.no_wandb:
        return 0
    import wandb

    entity, project = args.project.split("/")
    run = wandb.init(entity=entity, project=project, job_type="eval-feedback", config={"judge_model": JUDGE_MODEL, "dataset": args.dataset, "rows": len(rows)})
    score_cols = [c for c in ("under_40_words", "english", "mode_ok_det", "names_trap_det", "names_trap_judge", "mode_ok_judge", "reading_ok", "in_scope") if c in rows[0]]
    table = wandb.EvalTable(
        columns=list(rows[0].keys()),
        data=[list(r.values()) for r in rows],
        input_columns=["sessionId", "persona", "task", "mode", "trap_id", "item_id", "input", "expected"],
        output_columns=["reply", "words", "judge_note"] if "judge_note" in rows[0] else ["reply", "words"],
        score_columns=score_cols,
    )
    run.log({"feedback": table})
    for k, v in summary.items():
        run.summary[k] = v
    run.finish()
    log(f"logged EvalTable -> {run.url}")
    return 0


def summarize(rows: list[dict], judged: bool) -> dict:
    def rate(key: str, subset: list[dict]) -> float | None:
        scored = [r for r in subset if r.get(key) is not None]
        return round(sum(1 for r in scored if r[key]) / len(scored), 3) if scored else None

    keys = ["under_40_words", "english", "mode_ok_det", "names_trap_det"] + (["names_trap_judge", "mode_ok_judge", "reading_ok", "in_scope"] if judged else [])
    out: dict = {k: rate(k, rows) for k in keys}
    by_mode: dict[str, list[dict]] = defaultdict(list)
    by_persona: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_mode[r["mode"]].append(r)
        by_persona[r["persona"]].append(r)
    out["per_mode"] = {m: {k: rate(k, rs) for k in keys} for m, rs in sorted(by_mode.items())}
    out["per_persona"] = {p: {"n": len(rs), "names_trap_det": rate("names_trap_det", rs), **({"reading_ok": rate("reading_ok", rs)} if judged else {})} for p, rs in sorted(by_persona.items())}
    out["n"] = len(rows)
    return out


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("feedback", help="Score explain_miss / what_to_fix replies (deterministic checks + LLM judge)")
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--dataset", default="sim-v1-agent.jsonl", help="File in evals/datasets, or a path to any agent-outputs.jsonl")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--dry-run", action="store_true", help="Deterministic checks only; no judge, no wandb")
    p.add_argument("--no-wandb", action="store_true")
    p.set_defaults(func=run)
