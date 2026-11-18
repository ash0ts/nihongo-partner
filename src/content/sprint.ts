export type AppTab = "sprint" | "kana" | "grammar" | "numbers" | "vocab" | "sensei";

export interface CramBlock {
  id: string;
  hourLabel: string;
  minutes: number;
  title: string;
  whyItMattersTonight: string;
  targetTab: AppTab;
  actionLabel: string;
  checklist: string[];
  exitGate: string;
}

export const SIX_HOUR_SPRINT: CramBlock[] = [
  {
    id: "hour-1",
    hourLabel: "Hour 1 (0:00-1:00)",
    minutes: 60,
    title: "Hiragana Recognition Blitz (Zero Handwriting)",
    whyItMattersTonight:
      "Lesson 3 drops ALL romaji and puts hiragana furigana over every kanji. Reading speed beats handwriting 10:1 today.",
    targetTab: "kana",
    actionLabel: "Open Kana Lab (Hiragana + Contrast Pairs)",
    checklist: [
      "Scan the 46 Gojūon Hiragana mnemonics column by column (a -> k -> s -> t -> n -> h -> m -> y -> r -> w/n).",
      "Learn the 4 voicing switches (k->g, s->z, t->d, h->b/p) + small や/ゆ/よ glides & small っ stops.",
      "Drill Hiragana Lookalike Contrast Pairs (は/ほ, さ/き, ね/れ/わ, ぬ/め, る/ろ) until automatic.",
    ],
    exitGate: ">= 90% accuracy on 25 consecutive Hiragana Quiz prompts at < 2.5s per character.",
  },
  {
    id: "hour-2",
    hourLabel: "Hour 2 (1:00-2:00)",
    minutes: 60,
    title: "Katakana + L1-L2 Loanword Decoding",
    whyItMattersTonight:
      "Lesson 3 dialogues & drills use Katakana heavily (コーヒー, テレビ, デート, テニス, アイスクリーム) without romaji.",
    targetTab: "kana",
    actionLabel: "Open Kana Lab (Katakana + Loanwords)",
    checklist: [
      "Lock in the #1 geometry rule: シ & ン sweep UP-right from horizontal left ticks; ツ & ソ drop DOWN-left from vertical top ticks.",
      "Drill ウ/ワ/フ and マ/ム/ア triplets + long-vowel dash ー.",
      "Decode all 18 real Lesson 1-2 Katakana words (アメリカ, イギリス, コンピューター, スマホ, コンビニ, トイレ).",
    ],
    exitGate: "Read 15 Katakana loanwords aloud without peeking at romaji.",
  },
  {
    id: "hour-3",
    hourLabel: "Hour 3 (2:00-3:00)",
    minutes: 60,
    title: "Syntax Engine, Greetings & Lesson 1 Core",
    whyItMattersTonight:
      "Your instructor will likely open Week 1 with introductions, majors/occupations, and rapid Q&A warmups.",
    targetTab: "grammar",
    actionLabel: "Open Grammar Blueprint (L0 & L1)",
    checklist: [
      "Internalize [Topic は] Y です (drop わたしは once obvious; NEVER put さん on yourself; avoid あなた).",
      "Drill right-headed Noun1 の Noun2 chains (Modifier の Main Noun) and 〜ですか questions.",
      "Rehearse your personal 5-sentence Japanese self-introduction out loud 3 times.",
    ],
    exitGate: "Clear all Lesson 0 & Lesson 1 Cloze Drills cleanly + say your self-intro cold in 15 seconds.",
  },
  {
    id: "hour-4",
    hourLabel: "Hour 4 (3:00-4:00)",
    minutes: 60,
    title: "Numbers, 10^4 まん Grouping, Time, Age & Yen Traps",
    whyItMattersTonight:
      "Lesson 3 immediately asks 'What time do you wake up/go?' (なんじに...) using Lesson 1 clock rules.",
    targetTab: "numbers",
    actionLabel: "Open Numbers, Time & Yen Lab",
    checklist: [
      "Lock in the 3 irregular hours (4:00 よじ, 7:00 しちじ, 9:00 くじ) and minute -ぷん triggers (1, 3, 4, 6, 8, 10).",
      "Lock in 4th-year よねんせい (no ん!) and 20 years old はたち.",
      "Master 300/600/800 (さんびゃく/ろっぴゃく/はっぴゃく), 3000/8000 (さんぜん/はっせん), and 10,000 = いちまん.",
    ],
    exitGate: "Hit 15/15 on the Trap-Weighted Counter Quiz in kana or romaji.",
  },
  {
    id: "hour-5",
    hourLabel: "Hour 5 (4:00-5:00)",
    minutes: 60,
    title: "Lesson 2 Pointers (こそあど), も, じゃないです & No-Romaji Switch",
    whyItMattersTonight:
      "Spatial pointers (ここ/そこ/あそこ/どこ), inclusive も, and negative patterns recur inside Lesson 3 & 4.",
    targetTab: "grammar",
    actionLabel: "Open Grammar Blueprint (L2 Matrix + Switch to L3 Mode)",
    checklist: [
      "Flip the top display toggle to 'L3 Class Mode (Furigana, No Romaji)' for the final two hours!",
      "Master the 4x3 こそあど table: standalone これ vs pre-noun この+N vs location ここ/そこ/あそこ (irregular!).",
      "Drill も (replaces は!), Noun + じゃないです, and ね (shared agreement) vs よ (new info).",
    ],
    exitGate: "100% pass on Lesson 2 Cloze Drills with Romaji turned OFF.",
  },
  {
    id: "hour-6",
    hourLabel: "Hour 6 (5:00-6:00)",
    minutes: 60,
    title: "Page 81 Classroom Survival, Live Roleplay & Lesson 3 Preview",
    whyItMattersTonight:
      "Gives you real-time recovery lines in class ('Please say it slowly / again') plus a 15-min head start on tonight's Lesson 3 verbs.",
    targetTab: "sensei",
    actionLabel: "Open Sensei Roleplay & L3 Bridge",
    checklist: [
      "Drill all Classroom Survival cards (わかりません, ゆっくりいってください, もういちどいってください, ちょっとまってください).",
      "Complete all 3 Roleplay Scenarios (Evening Class Intro, Classmate Q&A, Shopping/Restaurant) + optional live Forge Inference chat.",
      "Read the 15-minute Lesson 3 Bridge (〜ます verbs + を/で/に/へ) and clear your Shaky SRS queue.",
    ],
    exitGate: "Zero items remaining in Shaky queue; ready to walk into Lesson 3 cold.",
  },
];
