/**
 * Free-form sentences a Lesson 0-2 learner might type into "Sensei, check my sentence".
 * Each carries the ground truth so the grading eval can score the agent. Trap ids match
 * `src/engine/traps.ts` where a sentence embeds one of the catalogued confusions.
 */
export interface SentenceCase {
  id: string;
  utterance: string;
  expectedCorrect: boolean;
  trapId?: string;
  note: string;
}

export const SENTENCE_CASES: SentenceCase[] = [
  { id: "s-intro-ok", utterance: "はじめまして。がくせいです。よろしくおねがいします。", expectedCorrect: true, note: "Textbook self-intro." },
  { id: "s-year4-wrong", utterance: "わたしは よんねんせいです。", expectedCorrect: false, trapId: "year-4-yonensei", note: "Must be よねんせい." },
  { id: "s-year4-ok", utterance: "わたしは よねんせいです。", expectedCorrect: true, trapId: "year-4-yonensei", note: "Correct irregular reading." },
  { id: "s-time4-wrong", utterance: "いま よんじです。", expectedCorrect: false, trapId: "hour-4-yoji", note: "Must be よじ." },
  { id: "s-time9-wrong", utterance: "いま きゅうじはんです。", expectedCorrect: false, trapId: "hour-9-kuji", note: "Must be くじはん." },
  { id: "s-age20-wrong", utterance: "わたしは にじゅっさいです。", expectedCorrect: false, trapId: "age-20-hatachi", note: "Genki: はたち." },
  { id: "s-age20-ok", utterance: "わたしは はたちです。", expectedCorrect: true, trapId: "age-20-hatachi", note: "Correct." },
  { id: "s-wa-typo", utterance: "わたしわ がくせいです。", expectedCorrect: false, trapId: "particle-wa-ha", note: "Topic particle written わ." },
  { id: "s-kono-wrong", utterance: "これ ほんは いくらですか。", expectedCorrect: false, trapId: "kore-kono", note: "この ほん is needed before a noun." },
  { id: "s-kono-ok", utterance: "この ほんは いくらですか。", expectedCorrect: true, trapId: "kore-kono", note: "Correct." },
  { id: "s-janai-ok", utterance: "それは わたしの かさじゃないです。", expectedCorrect: true, note: "Negative copula L2.6." },
  { id: "s-san-self", utterance: "わたしは たなかさんです。", expectedCorrect: false, note: "Never さん on your own name." },
  { id: "s-yen-wrong", utterance: "さんひゃくえんです。", expectedCorrect: false, trapId: "hundreds-voicing", note: "Must be さんびゃく." },
  { id: "s-yen-ok", utterance: "さんびゃくえんです。", expectedCorrect: true, trapId: "hundreds-voicing", note: "Correct." },
];

/**
 * Messages that are not sentence checks at all: requests beyond Lessons 0-2, general chat,
 * and English. `expectedCorrect` is false in the grading sense; what the evals and the
 * `scope-creep` tag look for is whether the Sensei stays inside the cram scope and says so.
 */
export const OFF_TOPIC_CASES: SentenceCase[] = [
  { id: "o-te-form", utterance: "can you explain the te-form? like 食べて", expectedCorrect: false, note: "Lesson 6 grammar; should defer." },
  { id: "o-kanji", utterance: "what does 水 mean and how do I write it", expectedCorrect: false, note: "Kanji beyond digits; out of scope." },
  { id: "o-sushi", utterance: "how do I say 'I want to eat sushi'?", expectedCorrect: false, note: "たい-form, Lesson 11." },
  { id: "o-chat", utterance: "lol this is so hard, are you a real teacher?", expectedCorrect: false, note: "Chat; brief redirect expected." },
  { id: "o-english-only", utterance: "I am a student.", expectedCorrect: false, note: "English sentence, no Japanese to grade." },
  { id: "o-weather", utterance: "what's the weather in tokyo right now", expectedCorrect: false, note: "Not a language question." },
  { id: "o-long-paste", utterance: "はじめまして。わたしは たなかです。がくせいです。よろしくおねがいします。せんこうは にほんごです。いま にねんせいです。でんわばんごうは 090-1234-5678です。", expectedCorrect: true, note: "Long but in-scope paste; should grade, not refuse." },
  { id: "o-empty-ish", utterance: "？", expectedCorrect: false, note: "Near-empty input." },
  { id: "o-greeting", utterance: "こんにちは！", expectedCorrect: true, note: "A greeting, fine as a sentence." },
];
