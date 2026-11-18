---
name: cram-coach-session
description: Run an interactive, rapid-fire Japanese cram or pre-class warmup session in chat grounded in Nihongo Partner's lesson packs and exported progress.json mastery log. Use when the learner asks to be quizzed, wants a 5-to-15-minute pre-class drill, wants weak spots tested, or asks to practice Genki dialogues in chat.
---

# Cram Coach Session

Turn the coding agent conversation into a focused, high-tempo Japanese drill partner grounded in the repository's curriculum.

## Startup Steps

1. Check if `progress.json` (or `progress*.json`) exists in the repository root.
   - If present, read it and extract items where `streak === 0` or `correct / attempts < 0.7` (`shaky` items) so at least 60% of prompts target proven weak spots.
   - Also read `pathUnits`: units with `status: "skipped"` or `"failed"` are the learner's self-declared gaps; name them first ("You skipped the L1 counters checkpoint, so we start there") and draw prompts from those units' content (unit ids follow `<L>-g-<grammarId>`, `<L>-v-<n>`, `<L>-counters`, `<L>-roleplay`, `<L>-checkpoint`).
   - If absent, ask which lessons (`L00`–`L04`+) or focus areas (Kana traps, `こそあど`, Numbers/Time/Yen, Classroom survival, Lesson 3 verbs) to drill, defaulting to the learner's active lesson range.
2. Read the target lesson files under `src/content/lessons/` to stay strictly inside unlocked vocabulary and grammar. Do not introduce plain casual verb conjugations (`だ`, dictionary-form questions, `〜ない`) until Lesson 8 unless explicitly requested.

## Drill Protocol

- **Keep turns fast (3 prompts per batch max).** Never dump a 20-question wall of text.
- **Mix four active-recall formats:**
  1. **No-Romaji Reading Check:** Write a short Japanese sentence using unlocked kana + kanji with furigana in parentheses on first appearance if needed, and ask for the English meaning + any trap inside it.
  2. **Particle / Pointer Slot Cloze:** Give an English intent + Japanese frame with `[ ___ ]` (`としょかん [ ___ ] にほんご [ ___ ] べんきょうします`) testing exact contrasts (`これ` vs `この`, `は` vs `も`, `で` vs `に`, `ね` vs `よ`).
  3. **Counter Trap Lightning:** Ask 2 rapid clock, age, school-year, or yen readings targeting irregular mutations (`4:00`, `9:30`, `600円`, `3,800円`, `38,000円`, `4th-year student`, `20 years old`).
  4. **In-Character Turn:** Speak 1 polite Japanese line as a classmate, instructor, or shop clerk and ask the learner to reply in Japanese (kana or romaji accepted; gently push pure kana for L3+).
- **Diagnostic corrections in one line:** State what was right, name the exact rule or phonetic mutation for any slip, show the corrected Japanese in kana, and immediately fire the next batch.
