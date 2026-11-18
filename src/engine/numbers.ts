export interface ReadingResult {
  promptLabel: string;
  kana: string;
  acceptedKana: string[];
  romaji: string;
  acceptedRomaji: string[];
  mutations: string[];
  breakdown: string;
}

const ONES_KANA = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const ONES_ROMAJI = ["", "ichi", "ni", "san", "yon", "go", "roku", "nana", "hachi", "kyuu"];

/**
 * Converts a 1..9999 sub-chunk into kana, romaji, and triggered phonetic shift notes.
 */
function convertUnderTenThousand(
  n: number,
  isUpperChunk = false,
): { kana: string; romaji: string; mutations: string[] } {
  const mutations: string[] = [];
  const kanaParts: string[] = [];
  const romajiParts: string[] = [];

  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;

  if (thousands > 0) {
    if (thousands === 1) {
      if (isUpperChunk) {
        kanaParts.push("いっせん");
        romajiParts.push("issen");
      } else {
        kanaParts.push("せん");
        romajiParts.push("sen");
      }
    } else if (thousands === 3) {
      kanaParts.push("さんぜん");
      romajiParts.push("sanzen");
      mutations.push("3,000 -> さんぜん (sanzen: s voices to z after n)");
    } else if (thousands === 8) {
      kanaParts.push("はっせん");
      romajiParts.push("hassen");
      mutations.push("8,000 -> はっせん (hassen: hachi clips to small tsu + sen)");
    } else {
      kanaParts.push(`${ONES_KANA[thousands]}せん`);
      romajiParts.push(`${ONES_ROMAJI[thousands]}sen`);
    }
  }

  if (hundreds > 0) {
    if (hundreds === 1) {
      kanaParts.push("ひゃく");
      romajiParts.push("hyaku");
    } else if (hundreds === 3) {
      kanaParts.push("さんびゃく");
      romajiParts.push("sanbyaku");
      mutations.push("300 -> さんびゃく (sanbyaku: h voices to b after n)");
    } else if (hundreds === 6) {
      kanaParts.push("ろっぴゃく");
      romajiParts.push("roppyaku");
      mutations.push("600 -> ろっぴゃく (roppyaku: roku + hyaku -> small tsu + pyaku)");
    } else if (hundreds === 8) {
      kanaParts.push("はっぴゃく");
      romajiParts.push("happyaku");
      mutations.push("800 -> はっぴゃく (happyaku: hachi + hyaku -> small tsu + pyaku)");
    } else {
      kanaParts.push(`${ONES_KANA[hundreds]}ひゃく`);
      romajiParts.push(`${ONES_ROMAJI[hundreds]}hyaku`);
    }
  }

  if (tens > 0) {
    if (tens === 1) {
      kanaParts.push("じゅう");
      romajiParts.push("juu");
    } else {
      kanaParts.push(`${ONES_KANA[tens]}じゅう`);
      romajiParts.push(`${ONES_ROMAJI[tens]}juu`);
    }
  }

  if (ones > 0) {
    kanaParts.push(ONES_KANA[ones]);
    romajiParts.push(ONES_ROMAJI[ones]);
  }

  return {
    kana: kanaParts.join(""),
    romaji: romajiParts.join(" "),
    mutations,
  };
}

export function spellInteger(n: number): ReadingResult {
  if (!Number.isInteger(n) || n < 0 || n > 99_999_999) {
    throw new RangeError(`spellInteger expects an integer in 0..99,999,999, got ${n}`);
  }
  if (n === 0) {
    return {
      promptLabel: "0",
      kana: "ゼロ",
      acceptedKana: ["ゼロ", "ぜろ", "れい"],
      romaji: "zero",
      acceptedRomaji: ["zero", "rei"],
      mutations: [],
      breakdown: "0 -> ゼロ (zero) or れい (rei)",
    };
  }

  const man = Math.floor(n / 10_000);
  const rem = n % 10_000;
  const mutations: string[] = [];
  const kanaChunks: string[] = [];
  const romajiChunks: string[] = [];
  const breakdownParts: string[] = [];

  if (man > 0) {
    const manRes = convertUnderTenThousand(man, true);
    kanaChunks.push(`${manRes.kana}まん`);
    romajiChunks.push(`${manRes.romaji} man`);
    mutations.push(...manRes.mutations);
    if (man === 1) {
      mutations.push("10,000 -> いちまん (ichiman: Japanese groups by 10^4 まん, and 10,000 requires いち)");
    } else {
      mutations.push(`${man * 10_000} groups by 10^4: ${man} × まん (${manRes.kana}まん)`);
    }
    breakdownParts.push(`${man}まん (${(man * 10_000).toLocaleString()})`);
  }

  if (rem > 0) {
    const remRes = convertUnderTenThousand(rem, false);
    kanaChunks.push(remRes.kana);
    romajiChunks.push(remRes.romaji);
    mutations.push(...remRes.mutations);
    breakdownParts.push(`${remRes.kana} (${rem.toLocaleString()})`);
  }

  const kana = kanaChunks.join("");
  const romaji = romajiChunks.join(" ").replace(/\s+/g, " ").trim();
  const acceptedKana = [kana];
  const acceptedRomaji = [romaji, romaji.replace(/\s+/g, "")];

  if (n === 4) {
    acceptedKana.push("し");
    acceptedRomaji.push("shi");
  } else if (n === 7) {
    acceptedKana.push("しち");
    acceptedRomaji.push("shichi");
  } else if (n === 9) {
    acceptedKana.push("く");
    acceptedRomaji.push("ku");
  }

  return {
    promptLabel: n.toLocaleString("en-US"),
    kana,
    acceptedKana,
    romaji,
    acceptedRomaji,
    mutations,
    breakdown: breakdownParts.join(" + "),
  };
}

export function spellYen(amount: number): ReadingResult {
  const base = spellInteger(amount);
  const kana = `${base.kana}えん`;
  const romaji = `${base.romaji} en`;
  return {
    promptLabel: `¥${amount.toLocaleString("en-US")}`,
    kana,
    acceptedKana: [kana],
    romaji,
    acceptedRomaji: [romaji, romaji.replace(/\s+/g, "")],
    mutations: base.mutations,
    breakdown: `${base.breakdown} + えん (yen)`,
  };
}

const HOUR_READINGS: Record<number, { kana: string; romaji: string; mutation?: string }> = {
  1: { kana: "いちじ", romaji: "ichiji" },
  2: { kana: "にじ", romaji: "niji" },
  3: { kana: "さんじ", romaji: "sanji" },
  4: {
    kana: "よじ",
    romaji: "yoji",
    mutation: "4:00 -> よじ (yoji: NEVER よんじ or しじ!)",
  },
  5: { kana: "ごじ", romaji: "goji" },
  6: { kana: "ろくじ", romaji: "rokuji" },
  7: {
    kana: "しちじ",
    romaji: "shichiji",
    mutation: "7:00 -> しちじ (shichiji in Genki; ななじ heard only for clarity announcements)",
  },
  8: { kana: "はちじ", romaji: "hachiji" },
  9: {
    kana: "くじ",
    romaji: "kuji",
    mutation: "9:00 -> くじ (kuji: NEVER きゅうじ!)",
  },
  10: { kana: "じゅうじ", romaji: "juuji" },
  11: { kana: "じゅういちじ", romaji: "juuichiji" },
  12: { kana: "じゅうにじ", romaji: "juuniji" },
};

function spellMinuteUnit(minute: number): {
  kana: string;
  altKana: string[];
  romaji: string;
  altRomaji: string[];
  mutation?: string;
} {
  const tens = Math.floor(minute / 10);
  const ones = minute % 10;

  if (ones === 0) {
    if (tens === 1) {
      return {
        kana: "じゅっぷん",
        altKana: ["じっぷん"],
        romaji: "juppun",
        altRomaji: ["jippun"],
        mutation: "10 min -> じゅっぷん / じっぷん (small tsu + pun)",
      };
    }
    const prefixKana = ONES_KANA[tens];
    const prefixRomaji = ONES_ROMAJI[tens];
    return {
      kana: `${prefixKana}じゅっぷん`,
      altKana: [`${prefixKana}じっぷん`],
      romaji: `${prefixRomaji}juppun`,
      altRomaji: [`${prefixRomaji}jippun`],
      mutation: `${minute} min -> 〜じゅっぷん (multiples of 10 trigger small tsu + pun)`,
    };
  }

  const tensKana = tens === 0 ? "" : tens === 1 ? "じゅう" : `${ONES_KANA[tens]}じゅう`;
  const tensRomaji = tens === 0 ? "" : tens === 1 ? "juu" : `${ONES_ROMAJI[tens]}juu`;

  switch (ones) {
    case 1:
      return {
        kana: `${tensKana}いっぷん`,
        altKana: [],
        romaji: `${tensRomaji}ippun`,
        altRomaji: [],
        mutation: `${minute} min -> ends in 1 -> いっぷん (small tsu + pun)`,
      };
    case 3:
      return {
        kana: `${tensKana}さんぷん`,
        altKana: [],
        romaji: `${tensRomaji}sanpun`,
        altRomaji: [],
        mutation: `${minute} min -> ends in 3 -> さんぷん (f shifts to p after n)`,
      };
    case 4:
      return {
        kana: `${tensKana}よんぷん`,
        altKana: [],
        romaji: `${tensRomaji}yonpun`,
        altRomaji: [],
        mutation: `${minute} min -> ends in 4 -> よんぷん (f shifts to p after n)`,
      };
    case 6:
      return {
        kana: `${tensKana}ろっぷん`,
        altKana: [],
        romaji: `${tensRomaji}roppun`,
        altRomaji: [],
        mutation: `${minute} min -> ends in 6 -> ろっぷん (roku clips to small tsu + pun)`,
      };
    case 8:
      return {
        kana: `${tensKana}はっぷん`,
        altKana: [`${tensKana}はちふん`],
        romaji: `${tensRomaji}happun`,
        altRomaji: [`${tensRomaji}hachifun`],
        mutation: `${minute} min -> ends in 8 -> はっぷん (or はちふん)`,
      };
    default:
      return {
        kana: `${tensKana}${ONES_KANA[ones]}ふん`,
        altKana: [],
        romaji: `${tensRomaji}${ONES_ROMAJI[ones]}fun`,
        altRomaji: [],
      };
  }
}

export function spellClockTime(
  hour: number,
  minute: number,
  period?: "am" | "pm",
): ReadingResult {
  const h = HOUR_READINGS[hour];
  if (!h || minute < 0 || minute > 59) {
    throw new RangeError(`Invalid clock time ${hour}:${minute}`);
  }

  const mutations: string[] = [];
  if (h.mutation) mutations.push(h.mutation);

  const periodKana = period === "am" ? "ごぜん" : period === "pm" ? "ごご" : "";
  const periodRomaji = period === "am" ? "gozen " : period === "pm" ? "gogo " : "";
  const periodLabel = period === "am" ? " AM" : period === "pm" ? " PM" : "";
  const mmStr = String(minute).padStart(2, "0");

  if (minute === 0) {
    const kana = `${periodKana}${h.kana}`;
    const romaji = `${periodRomaji}${h.romaji}`.trim();
    return {
      promptLabel: `${hour}:${mmStr}${periodLabel}`,
      kana,
      acceptedKana: [kana],
      romaji,
      acceptedRomaji: [romaji, romaji.replace(/\s+/g, "")],
      mutations,
      breakdown: `${periodKana ? `${periodKana} + ` : ""}${h.kana}`,
    };
  }

  if (minute === 30) {
    const kana = `${periodKana}${h.kana}はん`;
    const alt = `${periodKana}${h.kana}さんじゅっぷん`;
    const romaji = `${periodRomaji}${h.romaji} han`.trim();
    mutations.push("Half-past (:30) -> はん (han) in everyday speech (さんじゅっぷん also grammatical)");
    return {
      promptLabel: `${hour}:30${periodLabel}`,
      kana,
      acceptedKana: [kana, alt, `${periodKana}${h.kana}さんじっぷん`],
      romaji,
      acceptedRomaji: [
        romaji,
        romaji.replace(/\s+/g, ""),
        `${periodRomaji}${h.romaji} sanjuppun`.trim(),
      ],
      mutations,
      breakdown: `${periodKana ? `${periodKana} + ` : ""}${h.kana} + はん (half)`,
    };
  }

  const minRes = spellMinuteUnit(minute);
  if (minRes.mutation) mutations.push(minRes.mutation);

  const kana = `${periodKana}${h.kana}${minRes.kana}`;
  const romaji = `${periodRomaji}${h.romaji} ${minRes.romaji}`.trim();
  const acceptedKana = [kana, ...minRes.altKana.map((ak) => `${periodKana}${h.kana}${ak}`)];
  const acceptedRomaji = [
    romaji,
    romaji.replace(/\s+/g, ""),
    ...minRes.altRomaji.map((ar) => `${periodRomaji}${h.romaji} ${ar}`.trim()),
    ...minRes.altRomaji.map((ar) => `${periodRomaji}${h.romaji}${ar}`.replace(/\s+/g, "")),
  ];

  return {
    promptLabel: `${hour}:${mmStr}${periodLabel}`,
    kana,
    acceptedKana,
    romaji,
    acceptedRomaji,
    mutations,
    breakdown: `${periodKana ? `${periodKana} + ` : ""}${h.kana} + ${minRes.kana}`,
  };
}

export function spellAge(age: number): ReadingResult {
  if (!Number.isInteger(age) || age < 1 || age > 99) {
    throw new RangeError(`spellAge expects 1..99, got ${age}`);
  }
  if (age === 20) {
    return {
      promptLabel: "20 years old",
      kana: "はたち",
      acceptedKana: ["はたち"],
      romaji: "hatachi",
      acceptedRomaji: ["hatachi"],
      mutations: ["20 years old -> はたち (hatachi: special native reading, NOT にじゅっさい in Genki!)"],
      breakdown: "20歳 -> はたち (irregular)",
    };
  }

  const tens = Math.floor(age / 10);
  const ones = age % 10;
  const tensKana = tens === 0 ? "" : tens === 1 ? "じゅう" : `${ONES_KANA[tens]}じゅう`;
  const tensRomaji = tens === 0 ? "" : tens === 1 ? "juu" : `${ONES_ROMAJI[tens]}juu`;

  if (ones === 0) {
    const prefixKana = tens === 1 ? "" : ONES_KANA[tens];
    const prefixRomaji = tens === 1 ? "" : ONES_ROMAJI[tens];
    const kana = `${prefixKana}じゅっさい`;
    const alt = `${prefixKana}じっさい`;
    const romaji = `${prefixRomaji}jussai`;
    return {
      promptLabel: `${age} years old`,
      kana,
      acceptedKana: [kana, alt],
      romaji,
      acceptedRomaji: [romaji, `${prefixRomaji}jissai`],
      mutations: [`${age} years old -> 〜じゅっさい / 〜じっさい (juu clips before sai)`],
      breakdown: `${age} + さい -> ${kana}`,
    };
  }

  if (ones === 1) {
    const kana = `${tensKana}いっさい`;
    const romaji = `${tensRomaji}issai`;
    return {
      promptLabel: `${age} year${age === 1 ? "" : "s"} old`,
      kana,
      acceptedKana: [kana],
      romaji,
      acceptedRomaji: [romaji],
      mutations: [`Ends in 1 -> いっさい (ichi + sai -> issai)`],
      breakdown: `${age} + さい -> ${kana}`,
    };
  }

  if (ones === 8) {
    const kana = `${tensKana}はっさい`;
    const romaji = `${tensRomaji}hassai`;
    return {
      promptLabel: `${age} years old`,
      kana,
      acceptedKana: [kana],
      romaji,
      acceptedRomaji: [romaji],
      mutations: [`Ends in 8 -> はっさい (hachi + sai -> hassai)`],
      breakdown: `${age} + さい -> ${kana}`,
    };
  }

  const kana = `${tensKana}${ONES_KANA[ones]}さい`;
  const romaji = `${tensRomaji}${ONES_ROMAJI[ones]}sai`;
  return {
    promptLabel: `${age} years old`,
    kana,
    acceptedKana: [kana],
    romaji,
    acceptedRomaji: [romaji],
    mutations: [],
    breakdown: `${age} + さい -> ${kana}`,
  };
}

export function spellSchoolYear(year: number): ReadingResult {
  if (!Number.isInteger(year) || year < 1 || year > 4) {
    throw new RangeError(`spellSchoolYear expects 1..4, got ${year}`);
  }
  const ordinals = ["1st-year student", "2nd-year student", "3rd-year student", "4th-year student"];
  if (year === 4) {
    return {
      promptLabel: ordinals[3],
      kana: "よねんせい",
      acceptedKana: ["よねんせい"],
      romaji: "yonensei",
      acceptedRomaji: ["yonensei", "yonensee"],
      mutations: ["4th-year student -> よねんせい (yonensei: drops ん! NEVER よんねんせい!)"],
      breakdown: "よ (4) + ねんせい -> よねんせい",
    };
  }
  const kana = `${ONES_KANA[year]}ねんせい`;
  const romaji = `${ONES_ROMAJI[year]}nensei`;
  return {
    promptLabel: ordinals[year - 1],
    kana,
    acceptedKana: [kana],
    romaji,
    acceptedRomaji: [romaji, romaji.replace(/sei$/, "see")],
    mutations: [],
    breakdown: `${ONES_KANA[year]} + ねんせい -> ${kana}`,
  };
}

export type CounterDrillKind = "yen" | "time" | "age" | "schoolYear" | "number";

export interface CounterDrillQuestion {
  id: string;
  kind: CounterDrillKind;
  categoryLabel: string;
  questionPrompt: string;
  jpQuestion: string;
  solution: ReadingResult;
}

const CURATED_DRILL_POOL: Array<() => CounterDrillQuestion> = [
  () => ({
    id: "time-0400",
    kind: "time",
    categoryLabel: "Clock Time (Irregular Hour)",
    questionPrompt: "4:00",
    jpQuestion: "いま なんじですか。(4:00)",
    solution: spellClockTime(4, 0),
  }),
  () => ({
    id: "time-0930am",
    kind: "time",
    categoryLabel: "Clock Time (AM + Irregular 9 + Half)",
    questionPrompt: "9:30 AM",
    jpQuestion: "いま なんじですか。(9:30 AM)",
    solution: spellClockTime(9, 30, "am"),
  }),
  () => ({
    id: "time-0710pm",
    kind: "time",
    categoryLabel: "Clock Time (PM + 7 + 10 min)",
    questionPrompt: "7:10 PM",
    jpQuestion: "いま なんじですか。(7:10 PM)",
    solution: spellClockTime(7, 10, "pm"),
  }),
  () => ({
    id: "time-0205",
    kind: "time",
    categoryLabel: "Clock Time (-fun vs -pun)",
    questionPrompt: "2:05",
    jpQuestion: "いま なんじですか。(2:05)",
    solution: spellClockTime(2, 5),
  }),
  () => ({
    id: "time-0615",
    kind: "time",
    categoryLabel: "Clock Time (Minutes > 10)",
    questionPrompt: "6:15",
    jpQuestion: "いま なんじですか。(6:15)",
    solution: spellClockTime(6, 15),
  }),
  () => ({
    id: "time-1106",
    kind: "time",
    categoryLabel: "Clock Time (6-minute pun shift)",
    questionPrompt: "11:06",
    jpQuestion: "いま なんじですか。(11:06)",
    solution: spellClockTime(11, 6),
  }),
  () => ({
    id: "time-0301",
    kind: "time",
    categoryLabel: "Clock Time (1-minute ippun shift)",
    questionPrompt: "3:01",
    jpQuestion: "いま なんじですか。(3:01)",
    solution: spellClockTime(3, 1),
  }),
  () => ({
    id: "time-0804",
    kind: "time",
    categoryLabel: "Clock Time (4-minute yonpun shift)",
    questionPrompt: "8:04",
    jpQuestion: "いま なんじですか。(8:04)",
    solution: spellClockTime(8, 4),
  }),
  () => ({
    id: "age-20",
    kind: "age",
    categoryLabel: "Age (Genki Classic Trap)",
    questionPrompt: "20 years old",
    jpQuestion: "なんさいですか。(20 years old)",
    solution: spellAge(20),
  }),
  () => ({
    id: "age-18",
    kind: "age",
    categoryLabel: "Age (8 -> hassai shift)",
    questionPrompt: "18 years old",
    jpQuestion: "なんさいですか。(18 years old)",
    solution: spellAge(18),
  }),
  () => ({
    id: "age-21",
    kind: "age",
    categoryLabel: "Age (1 -> issai shift)",
    questionPrompt: "21 years old",
    jpQuestion: "なんさいですか。(21 years old)",
    solution: spellAge(21),
  }),
  () => ({
    id: "year-4",
    kind: "schoolYear",
    categoryLabel: "School Year (4th-Year Trap)",
    questionPrompt: "4th-year student",
    jpQuestion: "なんねんせいですか。(4th year)",
    solution: spellSchoolYear(4),
  }),
  () => ({
    id: "yen-300",
    kind: "yen",
    categoryLabel: "Shopping Price (300 shift)",
    questionPrompt: "¥300",
    jpQuestion: "これは いくらですか。(¥300)",
    solution: spellYen(300),
  }),
  () => ({
    id: "yen-600",
    kind: "yen",
    categoryLabel: "Shopping Price (600 shift)",
    questionPrompt: "¥600",
    jpQuestion: "このノートは いくらですか。(¥600)",
    solution: spellYen(600),
  }),
  () => ({
    id: "yen-800",
    kind: "yen",
    categoryLabel: "Shopping Price (800 shift)",
    questionPrompt: "¥800",
    jpQuestion: "そのかさは いくらですか。(¥800)",
    solution: spellYen(800),
  }),
  () => ({
    id: "yen-2600",
    kind: "yen",
    categoryLabel: "Shopping Price (Thousands + 600)",
    questionPrompt: "¥2,600",
    jpQuestion: "このほんは いくらですか。(¥2,600)",
    solution: spellYen(2600),
  }),
  () => ({
    id: "yen-3500",
    kind: "yen",
    categoryLabel: "Shopping Price (3,000 sanzen shift)",
    questionPrompt: "¥3,500",
    jpQuestion: "そのとけいは いくらですか。(¥3,500)",
    solution: spellYen(3500),
  }),
  () => ({
    id: "yen-8800",
    kind: "yen",
    categoryLabel: "Shopping Price (8,000 + 800 double trap)",
    questionPrompt: "¥8,800",
    jpQuestion: "あのかばんは いくらですか。(¥8,800)",
    solution: spellYen(8800),
  }),
  () => ({
    id: "yen-10000",
    kind: "yen",
    categoryLabel: "Shopping Price (10^4 Man Boundary)",
    questionPrompt: "¥10,000",
    jpQuestion: "このくつは いくらですか。(¥10,000)",
    solution: spellYen(10000),
  }),
  () => ({
    id: "yen-38000",
    kind: "yen",
    categoryLabel: "Shopping Price (Man + 8,000)",
    questionPrompt: "¥38,000",
    jpQuestion: "あのじてんしゃは いくらですか。(¥38,000)",
    solution: spellYen(38000),
  }),
];

export function getCuratedCounterDrills(filterKind: CounterDrillKind | "all" = "all"): CounterDrillQuestion[] {
  const all = CURATED_DRILL_POOL.map((fn) => fn());
  return filterKind === "all" ? all : all.filter((q) => q.kind === filterKind);
}
