"""`nihongo-evals` command line: build-dataset | grading | feedback | composer."""

from __future__ import annotations

import argparse
import sys

from . import composer, dataset, feedback, grading


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nihongo-evals", description="Offline evals for the Nihongo Partner Sensei agent")
    sub = parser.add_subparsers(dest="command", required=True)
    dataset.add_parser(sub)
    grading.add_parser(sub)
    feedback.add_parser(sub)
    composer.add_parser(sub)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
