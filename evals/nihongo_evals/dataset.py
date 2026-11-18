"""Publish the frozen simulator run and grading cases as Weave Datasets."""

from __future__ import annotations

import argparse

from .common import DATASETS_DIR, DEFAULT_PROJECT, log, read_jsonl

DATASETS = {
    "sim-v1-events": DATASETS_DIR / "sim-v1.jsonl",
    "sim-v1-agent-outputs": DATASETS_DIR / "sim-v1-agent.jsonl",
    "grading-cases-v1": DATASETS_DIR / "grading-cases.jsonl",
}


def flatten(row: dict) -> dict:
    """Weave datasets want flat-ish rows; nested `result` objects become JSON columns."""
    out = {}
    for k, v in row.items():
        out[k] = v if isinstance(v, (str, int, float, bool)) or v is None else v
    return out


def run(args: argparse.Namespace) -> int:
    counts = {name: len(read_jsonl(path)) for name, path in DATASETS.items() if path.exists()}
    missing = [name for name, path in DATASETS.items() if not path.exists()]
    for name, n in counts.items():
        log(f"{name}: {n} rows")
    if missing:
        log(f"missing: {', '.join(missing)} (run `pnpm sim:freeze` / `pnpm export:eval-cases`)")
    if args.dry_run:
        return 1 if missing else 0

    import weave

    weave.init(args.project)
    for name, path in DATASETS.items():
        if not path.exists():
            continue
        rows = [flatten(r) for r in read_jsonl(path)]
        ref = weave.publish(weave.Dataset(name=name, rows=rows))
        log(f"published {name} -> {ref.uri()}")
    return 0


def add_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("build-dataset", help="Publish frozen sim events, agent outputs, and grading cases as Weave Datasets")
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--dry-run", action="store_true", help="Only count rows; no network")
    p.set_defaults(func=run)
