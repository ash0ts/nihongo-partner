const ROMAJI_TO_HIRAGANA: Array<[string, string]> = [
  ["kya", "きゃ"],
  ["kyu", "きゅ"],
  ["kyo", "きょ"],
  ["sha", "しゃ"],
  ["sya", "しゃ"],
  ["shu", "しゅ"],
  ["syu", "しゅ"],
  ["sho", "しょ"],
  ["syo", "しょ"],
  ["cha", "ちゃ"],
  ["tya", "ちゃ"],
  ["chu", "ちゅ"],
  ["tyu", "ちゅ"],
  ["cho", "ちょ"],
  ["tyo", "ちょ"],
  ["nya", "にゃ"],
  ["nyu", "にゅ"],
  ["nyo", "にょ"],
  ["hya", "ひゃ"],
  ["hyu", "ひゅ"],
  ["hyo", "ひょ"],
  ["mya", "みゃ"],
  ["myu", "みゅ"],
  ["myo", "みょ"],
  ["rya", "りゃ"],
  ["ryu", "りゅ"],
  ["ryo", "りょ"],
  ["gya", "ぎゃ"],
  ["gyu", "ぎゅ"],
  ["gyo", "ぎょ"],
  ["ja", "じゃ"],
  ["jya", "じゃ"],
  ["zya", "じゃ"],
  ["ju", "じゅ"],
  ["jyu", "じゅ"],
  ["zyu", "じゅ"],
  ["jo", "じょ"],
  ["jyo", "じょ"],
  ["zyo", "じょ"],
  ["bya", "びゃ"],
  ["byu", "びゅ"],
  ["byo", "びょ"],
  ["pya", "ぴゃ"],
  ["pyu", "ぴゅ"],
  ["pyo", "ぴょ"],
  ["tsu", "つ"],
  ["chi", "ち"],
  ["shi", "し"],
  ["ka", "か"],
  ["ki", "き"],
  ["ku", "く"],
  ["ke", "け"],
  ["ko", "こ"],
  ["sa", "さ"],
  ["si", "し"],
  ["su", "す"],
  ["se", "せ"],
  ["so", "そ"],
  ["ta", "た"],
  ["ti", "ち"],
  ["tu", "つ"],
  ["te", "て"],
  ["to", "と"],
  ["na", "な"],
  ["ni", "に"],
  ["nu", "ぬ"],
  ["ne", "ね"],
  ["no", "の"],
  ["ha", "は"],
  ["hi", "ひ"],
  ["fu", "ふ"],
  ["hu", "ふ"],
  ["he", "へ"],
  ["ho", "ほ"],
  ["ma", "ま"],
  ["mi", "み"],
  ["mu", "む"],
  ["me", "め"],
  ["mo", "も"],
  ["ya", "や"],
  ["yu", "ゆ"],
  ["yo", "よ"],
  ["ra", "ら"],
  ["ri", "り"],
  ["ru", "る"],
  ["re", "れ"],
  ["ro", "ろ"],
  ["wa", "わ"],
  ["wo", "を"],
  ["ga", "が"],
  ["gi", "ぎ"],
  ["gu", "ぐ"],
  ["ge", "げ"],
  ["go", "ご"],
  ["za", "ざ"],
  ["ji", "じ"],
  ["zi", "じ"],
  ["zu", "ず"],
  ["ze", "ぜ"],
  ["zo", "ぞ"],
  ["da", "だ"],
  ["di", "ぢ"],
  ["du", "づ"],
  ["de", "で"],
  ["do", "ど"],
  ["ba", "ば"],
  ["bi", "び"],
  ["bu", "ぶ"],
  ["be", "べ"],
  ["bo", "ぼ"],
  ["pa", "ぱ"],
  ["pi", "ぴ"],
  ["pu", "ぷ"],
  ["pe", "ぺ"],
  ["po", "ぽ"],
  ["a", "あ"],
  ["i", "い"],
  ["u", "う"],
  ["e", "え"],
  ["o", "お"],
];

/** Converts Katakana characters (excluding ー) into Hiragana for canonical comparison. */
export function katakanaToHiragana(input: string): string {
  return Array.from(input)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCharCode(code - 0x60);
      }
      return ch;
    })
    .join("");
}

/** Converts ASCII romaji input into Hiragana (handling nn/n', sokuon double consonants, and tch). */
export function romajiToHiragana(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s\-'.。、？！?!]/g, "");
  let out = "";
  let i = 0;

  while (i < s.length) {
    // Double 'nn': if followed by vowel or 'y' (e.g. konnichiwa, sannensei, onna),
    // first 'n' is ん and second 'n' starts na/ni/nu/ne/no/nya...; otherwise consume both as ん.
    if (s.slice(i, i + 2) === "nn") {
      const after = s[i + 2];
      out += "ん";
      i += after && /[aiueoy]/.test(after) ? 1 : 2;
      continue;
    }

    // "tch" -> っち / っちゃ / っちゅ / っちょ
    if (s.slice(i, i + 3) === "tch") {
      out += "っ";
      i += 1;
      continue;
    }

    // Double consonant (except n) -> small っ
    const c1 = s[i];
    const c2 = s[i + 1];
    if (c1 && c2 && c1 === c2 && /[bcdfghjklmpqrstvwxyz]/.test(c1) && c1 !== "n") {
      out += "っ";
      i += 1;
      continue;
    }

    // Single 'n' followed by non-vowel / non-y or end of string -> ん
    if (c1 === "n") {
      const next = s[i + 1];
      if (!next || (!/[aiueoy]/.test(next) && next !== "n")) {
        out += "ん";
        i += 1;
        continue;
      }
    }

    let matched = false;
    for (const [rom, kana] of ROMAJI_TO_HIRAGANA) {
      if (s.startsWith(rom, i)) {
        out += kana;
        i += rom.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      out += s[i];
      i += 1;
    }
  }

  return out;
}

/** Canonicalizes user text (romaji, hiragana, or katakana) for tolerant Japanese drill grading. */
export function normalizeJapaneseInput(input: string): string {
  const trimmed = input
    .trim()
    .toLowerCase()
    .replace(/[\s。、？！?!,.]/g, "");
  if (!trimmed) return "";

  const hasAsciiLetters = /[a-z]/.test(trimmed);
  const converted = hasAsciiLetters ? romajiToHiragana(trimmed) : trimmed;
  return katakanaToHiragana(converted);
}

export function isAnswerAccepted(
  userInput: string,
  acceptedKana: string[],
  acceptedRomaji: string[] = [],
): boolean {
  const cleanRaw = userInput
    .trim()
    .toLowerCase()
    .replace(/[\s。、？！?!,.]/g, "");
  if (!cleanRaw) return false;

  for (const r of acceptedRomaji) {
    if (cleanRaw === r.toLowerCase().replace(/[\s。、？！?!,.]/g, "")) {
      return true;
    }
  }

  const normalizedUser = normalizeJapaneseInput(userInput);
  for (const k of acceptedKana) {
    const normalizedTarget = normalizeJapaneseInput(k);
    if (normalizedUser === normalizedTarget) {
      return true;
    }
    // Topic particle は typed phonetically in romaji ("wa"). Kana わ is NOT accepted:
    // writing わ for the topic particle is the Week-1 typo the cloze drills exist to catch.
    if (normalizedTarget === "は" && (cleanRaw === "wa" || cleanRaw === "ha")) {
      return true;
    }
  }

  return false;
}
