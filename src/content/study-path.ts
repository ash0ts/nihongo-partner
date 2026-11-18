import { buildStudyPath, type KanaCurriculum, type StudyPath } from "../engine/path";
import {
  CONTRAST_PAIRS,
  GOJUON_KANA,
  KATAKANA_LOANWORD_DRILLS,
  LESSONS,
  ORTHOGRAPHY_MECHANICS,
  VOICING_RULES,
} from "./index";

export const KANA_CURRICULUM: KanaCurriculum = {
  gojuon: GOJUON_KANA,
  voicing: VOICING_RULES,
  mechanics: ORTHOGRAPHY_MECHANICS,
  contrastPairs: CONTRAST_PAIRS,
  loanwords: KATAKANA_LOANWORD_DRILLS,
};

/** The guided path derived from every lesson pack in `LESSONS`. */
export const STUDY_PATH: StudyPath = buildStudyPath(LESSONS, KANA_CURRICULUM);
