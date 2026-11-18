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
