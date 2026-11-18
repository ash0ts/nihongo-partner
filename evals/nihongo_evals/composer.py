"""Composer eval: does `compose_exercise_set` follow the teaching rules it claims to?

Input is `evals/datasets/composer-cases.jsonl` from `pnpm export:composer-cases`, one row per
simulated learner with the trap statistics the composer saw and the set it produced. The
checks are the rules in docs/teaching-rationale.md, made measurable:

  targets_weak_traps  items hitting the top-3 missed traps >= min(half the set, misses on those traps)
  interleaved         no three consecutive items share a trap id
  desirable_difficulty the set's mean predicted accuracy lands in 0.6-0.9 (the 85% rule, set-level)
  fades_scaffold      items the learner has got right twice are asked typed, not multiple choice
  mode_appropriate    classroom/immersion sets ask kana recognition typed, not as romaji multiple choice
  spaced              at most 40% of items were seen in the learner's last 10 events
  rationale_grounded  (judge) the English rationale names only rules the set actually applied

`--dry-run` runs the deterministic checks only.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from .common import DATASETS_DIR, DEFAULT_PROJECT, JUDGE_MODEL, judge_client, judge_json, log, read_jsonl, write_jsonl

JUDGE_SYSTEM = """You audit a tutor's one-paragraph rationale for a custom exercise set.
Answer JSON ONLY: {"grounded": bool, "plain_english": bool, "note": string}.
- grounded: false ONLY if the rationale states a count or statistic that is not in allowed_numbers and not part of a trap label or rule wording, or describes a rule that is not in applied_rules. Restating a rule's own wording ("half the set", "roughly 8 out of 10"), naming traps by their labels (which may contain numbers like 300 or 20), and rounding ("about half" for 4 or 5 of 10) are all grounded. Do not judge whether the rule was applied well; only whether the text invents facts.
- plain_english: a beginner could read it; no jargon beyond the rule names.
Keep note under 20 words."""


def allowed_numbers(row: dict) -> list[int]:
    facts = row["set"].get("facts", {})
    nums = {len(row["set"]["items"]), facts.get("weakItems", 0), facts.get("reviewDue", 0), facts.get("fadedToTyped", 0), facts.get("inBand", 0), facts.get("eventsSeen", 0)}
    for t in facts.get("topTraps", []):
        nums.update({t.get("misses", 0), t.get("attempts", 0)})
        nums.update(int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", t.get("label", "")))
    for meaning in (row.get("ruleMeanings") or {}).values():
        nums.update(int(x) for x in re.findall(r"\d+", meaning))
    n = len(row["set"]["items"])
    nums.update({1, 2, 3, 10, n // 2, (n + 1) // 2})
    return sorted(nums)


def deterministic(row: dict) -> dict:
    items = row["set"]["items"]
    n = max(1, len(items))
    top_stats = [t for t in row["trapStats"][:3] if t.get("misses", 0) > 0]
    top = {t["trapId"] for t in top_stats}
    hits = sum(1 for it in items if it.get("trapId") in top)
    # Half the set, or one item per miss when the learner missed fewer than that.
    needed = min((n + 1) // 2, sum(t["misses"] for t in top_stats))
    interleaved = all(not (items[i].get("trapId") and items[i].get("trapId") == items[i - 1].get("trapId") == items[i - 2].get("trapId")) for i in range(2, len(items)))
    mean_acc = sum((it.get("predictedAccuracy") or 0) for it in items) / n
    faded = all(it["answerKind"] == "typed" for it in items if it.get("recentCorrectStreak", 0) >= 2 and it.get("typedCapable"))
    recent = set(row.get("recentCorrectItemIds") or row.get("recentItemIds") or [])
    spaced = sum(1 for it in items if it["itemId"] in recent) / n <= 0.4
    # Classroom/immersion sets ask kana recognition as typing (Lesson 3 format), not romaji multiple choice.
    mode_ok = row["mode"] == "bridge" or all(not (it.get("skill") == "kana-read" and it["answerKind"] == "choice" and it.get("typedCapable")) for it in items)
    return {
        "n_items": len(items),
        "targets_weak_traps": (hits >= needed) if top else True,
        "interleaved": interleaved,
        "desirable_difficulty": 0.6 <= mean_acc <= 0.9,
        "mean_predicted_accuracy": round(mean_acc, 2),
        "fades_scaffold": faded,
        "mode_appropriate": mode_ok,
        "spaced": spaced,
    }


def judge_row(client, row: dict) -> dict:
    user = json.dumps(
        {
            "rationale": row["set"].get("rationale", ""),
            "applied_rules": [{"id": r, "meaning": (row.get("ruleMeanings") or {}).get(r, "")} for r in row["set"].get("rules", [])],
            "facts": row["set"].get("facts", {}),
            "allowed_numbers": allowed_numbers(row),
        },
        ensure_ascii=False,
    )
    try:
        v = judge_json(client, JUDGE_SYSTEM, user)
    except Exception as err:  # noqa: BLE001
        v = {"note": f"judge error: {str(err)[:80]}"}
    return {"rationale_grounded": v.get("grounded"), "plain_english": v.get("plain_english"), "judge_note": v.get("note", "")}


def run(args: argparse.Namespace) -> int:
    path = DATASETS_DIR / "composer-cases.jsonl"
    if not path.exists():
        log(f"missing {path}; run `pnpm export:composer-cases`")
        return 1
    cases = read_jsonl(path)
    if args.limit:
        cases = cases[: args.limit]
    log(f"{len(cases)} composer cases")

    rows = []
    for c in cases:
        rows.append({"sessionId": c["sessionId"], "persona": c["persona"], "unitId": c["unitId"], "mode": c["mode"], "rationale": c["set"].get("rationale", ""), "rules": ", ".join(c["set"].get("rules", [])), **deterministic(c)})

    judged = not args.dry_run and any(c["set"].get("rationale") for c in cases)
    if judged:
        client = judge_client(args.project)
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            verdicts = list(pool.map(lambda c: judge_row(client, c), cases))
        for r, v in zip(rows, verdicts):
            r.update(v)

    keys = ["targets_weak_traps", "interleaved", "desirable_difficulty", "fades_scaffold", "mode_appropriate", "spaced"] + (["rationale_grounded", "plain_english"] if judged else [])
    summary = {k: rate(k, rows) for k in keys}
    by_persona: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_persona[r["persona"]].append(r)
    summary["per_persona"] = {p: {k: rate(k, rs) for k in keys[:3]} for p, rs in sorted(by_persona.items())}
    summary["n"] = len(rows)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    write_jsonl(DATASETS_DIR.parent / "out" / "composer-results.jsonl", rows)

    if args.dry_run or args.no_wandb:
        return 0
    import wandb

    entity, project = args.project.split("/")
    run = wandb.init(entity=entity, project=project, job_type="eval-composer", config={"judge_model": JUDGE_MODEL, "rows": len(rows)})
    table = wandb.EvalTable(
        columns=list(rows[0].keys()),
        data=[list(r.values()) for r in rows],
        input_columns=["sessionId", "persona", "unitId", "mode"],
        output_columns=["rationale", "rules", "n_items"] + (["judge_note"] if judged else []),
        score_columns=keys,
    )
    run.log({"composer": table})
    for k, v in summary.items():
        run.summary[k] = v
    run.finish()
    log(f"logged EvalTable -> {run.url}")
    return 0


def rate(key: str, rows: list[dict]) -> float | None:
    scored = [r for r in rows if r.get(key) is not None]
    return round(sum(1 for r in scored if r[key]) / len(scored), 3) if scored else None


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("composer", help="Check composed exercise sets against the teaching rules")
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-wandb", action="store_true")
    p.set_defaults(func=run)
