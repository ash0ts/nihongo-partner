"""Shared helpers: paths, JSONL IO, credentials, the Sensei server, and the judge model.

Credentials come from WANDB_API_KEY or ~/.netrc (api.wandb.ai), the same way the TS server
resolves them. Nothing here reads keys from the repo.
"""

from __future__ import annotations

import json
import netrc
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import httpx

EVALS_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = EVALS_DIR.parent
DATASETS_DIR = EVALS_DIR / "datasets"

DEFAULT_PROJECT = os.environ.get("FORGE_PROJECT", "wandb/nihongo-sensei")
DEFAULT_MODEL = os.environ.get("FORGE_MODEL", "zai-org/GLM-5.3-Flash")
# A different family from the agent model, and one that honours thinking=disabled with JSON output.
JUDGE_MODEL = os.environ.get("FORGE_JUDGE_MODEL", "Qwen/Qwen3.8-27B")
INFERENCE_URL = "https://api.inference.wandb.ai/v1"
SENSEI_URL = os.environ.get("SENSEI_URL", "http://127.0.0.1:5179")

ROMAJI_WORD = re.compile(r"\b[a-z]{2,}\b")
KANA = re.compile(r"[\u3040-\u30ff]")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def wandb_key() -> str | None:
    key = os.environ.get("WANDB_API_KEY")
    if key:
        return key
    try:
        auth = netrc.netrc().authenticators("api.wandb.ai")
    except (FileNotFoundError, netrc.NetrcParseError):
        return None
    return auth[2] if auth else None


def split_project(project: str) -> tuple[str, str]:
    entity, _, name = project.partition("/")
    return entity, name


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------
# Judge (Forge Serverless Inference, OpenAI-compatible)
# --------------------------------------------------------------------------------------


def judge_client(project: str):
    from openai import OpenAI

    key = wandb_key()
    if not key:
        raise SystemExit("No W&B key (WANDB_API_KEY or ~/.netrc). Use --dry-run or log in first.")
    return OpenAI(base_url=INFERENCE_URL, api_key=key, default_headers={"OpenAI-Project": project})


def judge_json(client, system: str, user: str, model: str = JUDGE_MODEL) -> dict[str, Any]:
    """One JSON-only judge call with thinking disabled. Returns {} on malformed output."""
    res = client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=400,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        extra_body={"chat_template_kwargs": {"enable_thinking": False}, "thinking": {"type": "disabled"}},
    )
    text = (res.choices[0].message.content or "").strip()
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


# --------------------------------------------------------------------------------------
# Deterministic text checks shared by the feedback judge and the Agent Lens tag criteria
# --------------------------------------------------------------------------------------

ENGLISH_STOPWORDS = {"the", "is", "you", "not", "and", "for", "that", "this", "with", "wrote", "answer"}


def word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", text.strip()) if w])


def looks_english(text: str) -> bool:
    words = {w.lower() for w in re.findall(r"[A-Za-z']+", text)}
    return len(words & ENGLISH_STOPWORDS) >= 2 or (len(words) >= 5 and not KANA.search(text))


_ROMAJI_TABLE = {
    "a": "あ", "i": "い", "u": "う", "e": "え", "o": "お",
    "ka": "か", "ki": "き", "ku": "く", "ke": "け", "ko": "こ", "ga": "が", "gi": "ぎ", "gu": "ぐ", "ge": "げ", "go": "ご",
    "sa": "さ", "shi": "し", "si": "し", "su": "す", "se": "せ", "so": "そ", "za": "ざ", "ji": "じ", "zi": "じ", "zu": "ず", "ze": "ぜ", "zo": "ぞ",
    "ta": "た", "chi": "ち", "ti": "ち", "tsu": "つ", "tu": "つ", "te": "て", "to": "と", "da": "だ", "di": "ぢ", "du": "づ", "de": "で", "do": "ど",
    "na": "な", "ni": "に", "nu": "ぬ", "ne": "ね", "no": "の",
    "ha": "は", "hi": "ひ", "fu": "ふ", "hu": "ふ", "he": "へ", "ho": "ほ", "ba": "ば", "bi": "び", "bu": "ぶ", "be": "べ", "bo": "ぼ", "pa": "ぱ", "pi": "ぴ", "pu": "ぷ", "pe": "ぺ", "po": "ぽ",
    "ma": "ま", "mi": "み", "mu": "む", "me": "め", "mo": "も", "ya": "や", "yu": "ゆ", "yo": "よ",
    "ra": "ら", "ri": "り", "ru": "る", "re": "れ", "ro": "ろ", "wa": "わ", "wo": "を", "n": "ん", "nn": "ん",
    "kya": "きゃ", "kyu": "きゅ", "kyo": "きょ", "gya": "ぎゃ", "gyu": "ぎゅ", "gyo": "ぎょ", "sha": "しゃ", "shu": "しゅ", "sho": "しょ", "sya": "しゃ", "syu": "しゅ", "syo": "しょ",
    "ja": "じゃ", "ju": "じゅ", "jo": "じょ", "jya": "じゃ", "jyu": "じゅ", "jyo": "じょ", "cha": "ちゃ", "chu": "ちゅ", "cho": "ちょ", "tya": "ちゃ", "tyu": "ちゅ", "tyo": "ちょ",
    "nya": "にゃ", "nyu": "にゅ", "nyo": "にょ", "hya": "ひゃ", "hyu": "ひゅ", "hyo": "ひょ", "bya": "びゃ", "byu": "びゅ", "byo": "びょ", "pya": "ぴゃ", "pyu": "ぴゅ", "pyo": "ぴょ",
    "mya": "みゃ", "myu": "みゅ", "myo": "みょ", "rya": "りゃ", "ryu": "りゅ", "ryo": "りょ",
}
_KATA_TO_HIRA = {chr(c): chr(c - 0x60) for c in range(0x30A1, 0x30F7)}


def romaji_to_hiragana(token: str) -> str | None:
    """Greedy Hepburn/kunrei conversion; None when any part of the token is not Japanese."""
    out, i, t = [], 0, token.lower()
    while i < len(t):
        if i + 1 < len(t) and t[i] == t[i + 1] and t[i] not in "aeiou" and t[i] != "n":
            out.append("っ")
            i += 1
            continue
        for size in (3, 2, 1):
            chunk = t[i : i + size]
            if chunk in _ROMAJI_TABLE and not (chunk == "n" and i + 1 < len(t) and t[i + 1] in "aeiouy"):
                out.append(_ROMAJI_TABLE[chunk])
                i += size
                break
        else:
            return None
    return "".join(out)


def romaji_leak(text: str, mode: str, kana_context: str = "") -> bool:
    """Latin spelling of a Japanese word that appears (in kana) in the reply or its context.

    Mirrors `romajiFree` in server/agent/sensei.ts: English words either fail the kana
    conversion or convert to kana that is not present, so prose does not trip the check.
    """
    if mode == "bridge":
        return False
    haystack = "".join(_KATA_TO_HIRA.get(ch, ch) for ch in f"{text} {kana_context}")
    for tok in ROMAJI_WORD.findall(text.lower()):
        if len(tok) < 3 or tok in META_WORDS:
            continue
        kana = romaji_to_hiragana(tok)
        if kana and kana in haystack:
            return True
    return False


# Words about Japanese that are legitimately written in Latin letters in an English explanation.
META_WORDS = {"kana", "hiragana", "katakana", "kanji", "romaji", "genki", "sensei", "dakuten", "handakuten", "sokuon", "furigana", "yoon"}


def names_trap(text: str, trap_label: str | None, expected: str) -> bool:
    if not trap_label:
        return True
    lowered = text.lower()
    head = trap_label.split(" ")[0].lower()
    return head in lowered or (bool(expected) and expected in text)


# --------------------------------------------------------------------------------------
# Sensei server (the TS agent). Spawned on demand so `nihongo-evals grading` is one command.
# --------------------------------------------------------------------------------------


@dataclass
class SenseiServer:
    url: str
    proc: subprocess.Popen | None = None

    def status(self) -> dict[str, Any] | None:
        try:
            r = httpx.get(f"{self.url}/api/tutor/status", timeout=5)
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None

    def post(self, path: str, body: dict[str, Any], timeout: float = 90) -> dict[str, Any]:
        r = httpx.post(f"{self.url}/api/tutor/{path}", json=body, timeout=timeout)
        r.raise_for_status()
        return r.json()

    def close(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.send_signal(2)  # SIGINT so the tracer flushes
            try:
                self.proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def ensure_sensei(url: str = SENSEI_URL, spawn: bool = True, tracing: bool = True) -> SenseiServer:
    server = SenseiServer(url)
    if server.status():
        return server
    if not spawn:
        raise SystemExit(f"Sensei server not reachable at {url}. Run `pnpm sensei` or drop --no-spawn.")
    port = url.rsplit(":", 1)[-1]
    env = {**os.environ, "SENSEI_PORT": port}
    if not tracing:
        env["FORGE_TRACING"] = "0"
    log(f"starting Sensei server on {url} ...")
    server.proc = subprocess.Popen(["pnpm", "sensei"], cwd=REPO_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(0.5)
        if server.status():
            return server
    server.close()
    raise SystemExit("Sensei server did not come up in 30s.")
