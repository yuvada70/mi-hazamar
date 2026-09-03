/**
 * מנגנון הניקוד.
 *
 * הניקוד נקבע לפי שני גורמים בלבד — נכונות ומהירות:
 *  • תשובה שגויה, או היעדר תשובה, שווה תמיד 0 נקודות.
 *  • תשובה נכונה מזכה בין minScore ל-maxScore נקודות, בהתאם למהירות
 *    התשובה בתוך חלון הזמן של הסיבוב: תשובה מיידית מזכה במקסימום,
 *    ותשובה ברגע האחרון עדיין מזכה במינימום — כך שנכונות תמיד
 *    "שווה" יותר ממהירות (אין דרך לעקוף תשובה נכונה של מישהו אחר
 *    רק בזכות מהירות), אבל בין שתי תשובות נכונות המהירה יותר מנצחת.
 *
 * הניקוד זהה לכל השחקנים ולכל דרגות הקושי — דרגת הקושי משפיעה רק על
 * בחירת השירים, לא על נוסחת הניקוד.
 */

/** פרמטרים הניתנים לכוונון ללא שינוי קוד קורא. */
export interface ScoringConfig {
  /** ניקוד לתשובה נכונה שנשלחה מיידית (זמן שחלף = 0). */
  readonly maxScore: number;
  /** ניקוד לתשובה נכונה שנשלחה ממש ברגע האחרון. */
  readonly minScore: number;
}

/** הגדרות הניקוד המכוילות למשחק. */
export const DEFAULT_SCORING: ScoringConfig = {
  maxScore: 1000,
  minScore: 400,
};

/** תוצאת חישוב ניקוד לתשובה בודדת. */
export interface AnswerScore {
  readonly correct: boolean;
  readonly points: number;
}

/** ניקוד סיבוב שבו המשתתף לא ענה. */
export const NO_ANSWER_SCORE: AnswerScore = { correct: false, points: 0 };

/**
 * מחשב את הניקוד עבור תשובה בודדת.
 *
 * @param isCorrect       האם האפשרות שנבחרה היא המבצע/ת המקורי/ת.
 * @param elapsedMs       הזמן שחלף מתחילת הסיבוב ועד התשובה, במילישניות.
 * @param roundDurationMs משך הסיבוב, במילישניות.
 */
export function scoreAnswer(
  isCorrect: boolean,
  elapsedMs: number,
  roundDurationMs: number,
  config: ScoringConfig = DEFAULT_SCORING,
): AnswerScore {
  if (!isCorrect) return { correct: false, points: 0 };

  const remaining = 1 - Math.min(1, Math.max(0, elapsedMs / Math.max(1, roundDurationMs)));
  const points = Math.round(config.minScore + (config.maxScore - config.minScore) * remaining);
  return { correct: true, points };
}
