import {
  CONTRAST_PAIRS,
  ContrastPairSchema,
  GOJUON_KANA,
  KanaEntrySchema,
  LESSONS,
  LessonPackSchema,
  type TextSegment,
} from "../src/content-exports-for-scripts";

const KANJI_REGEX = /[\u4E00-\u9FFF]/;
const HIRAGANA_ONLY_REGEX = /^[\u3040-\u309Fー・\s]+$/;

function checkSegmentsHaveFurigana(context: string, segments: TextSegment[], errors: string[]): void {
  for (const seg of segments) {
    if (KANJI_REGEX.test(seg.text)) {
      if (!seg.furigana) {
        errors.push(`${context}: segment "${seg.text}" contains Kanji without furigana`);
      } else if (!HIRAGANA_ONLY_REGEX.test(seg.furigana)) {
        errors.push(
          `${context}: furigana "${seg.furigana}" on "${seg.text}" must be pure Hiragana`,
        );
      }
    }
  }
}

function main(): void {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  const registerId = (kind: string, id: string) => {
    if (seenIds.has(id)) {
      errors.push(`Duplicate ID across curriculum: [${kind}] ${id}`);
    }
    seenIds.add(id);
  };

  if (GOJUON_KANA.length !== 46) {
    errors.push(`Expected 46 base Gojūon kana, found ${GOJUON_KANA.length}`);
  }

  for (const k of GOJUON_KANA) {
    const res = KanaEntrySchema.safeParse(k);
    if (!res.success) {
      errors.push(`Invalid KanaEntry ${k.id}: ${res.error.message}`);
    }
    registerId("kana", k.id);
  }

  for (const pair of CONTRAST_PAIRS) {
    const res = ContrastPairSchema.safeParse(pair);
    if (!res.success) {
      errors.push(`Invalid ContrastPair ${pair.id}: ${res.error.message}`);
    }
    registerId("contrastPair", pair.id);
  }

  for (const lesson of LESSONS) {
    const res = LessonPackSchema.safeParse(lesson);
    if (!res.success) {
      errors.push(`Invalid LessonPack ${lesson.id}: ${res.error.message}`);
    }
    registerId("lesson", lesson.id);

    if (lesson.number >= 3 && lesson.romajiPolicy !== "no-romaji") {
      errors.push(
        `Lesson ${lesson.id} (number >= 3) must enforce romajiPolicy: "no-romaji" to match Genki L3+`,
      );
    }

    checkSegmentsHaveFurigana(`${lesson.id}.jpTitle`, lesson.jpTitle.segments, errors);

    for (const g of lesson.grammar) {
      registerId("grammar", g.id);
      for (const ex of g.examples) {
        checkSegmentsHaveFurigana(`${g.id}.example`, ex.segments, errors);
      }
    }

    for (const v of lesson.vocab) {
      registerId("vocab", v.id);
      checkSegmentsHaveFurigana(`${v.id}`, v.segments, errors);
    }

    for (const c of lesson.clozeDrills) {
      registerId("cloze", c.id);
      checkSegmentsHaveFurigana(`${c.id}.before`, c.beforeSegments, errors);
      checkSegmentsHaveFurigana(`${c.id}.after`, c.afterSegments, errors);
      if (!c.options.includes(c.blankAnswerKana)) {
        errors.push(`${c.id}: blankAnswerKana "${c.blankAnswerKana}" missing from options`);
      }
      if (!c.acceptedAnswers.includes(c.blankAnswerKana)) {
        errors.push(`${c.id}: blankAnswerKana "${c.blankAnswerKana}" missing from acceptedAnswers`);
      }
    }

    for (const rp of lesson.roleplays) {
      registerId("roleplay", rp.id);
      for (const turn of rp.turns) {
        checkSegmentsHaveFurigana(`${rp.id}.promptJp`, turn.promptJp.segments, errors);
        const correctCount = turn.choices.filter((ch) => ch.isCorrect).length;
        if (correctCount !== 1) {
          errors.push(`${rp.id}: expected exactly 1 correct choice per turn, got ${correctCount}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Curriculum validation FAILED:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  const totalVocab = LESSONS.reduce((acc, l) => acc + l.vocab.length, 0);
  const totalGrammar = LESSONS.reduce((acc, l) => acc + l.grammar.length, 0);
  const totalCloze = LESSONS.reduce((acc, l) => acc + l.clozeDrills.length, 0);
  console.log(
    `Curriculum OK: ${GOJUON_KANA.length} gojuon kana, ${CONTRAST_PAIRS.length} contrast pairs, ${LESSONS.length} lessons (${totalGrammar} grammar blocks, ${totalVocab} vocab cards, ${totalCloze} cloze drills).`,
  );
}

main();
