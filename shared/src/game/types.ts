/**
 * טיפוסי הליבה של המשחק — שפה משותפת לשרת וללקוח.
 *
 * עיקרון מנחה: מה שנשלח ללקוח במהלך הסיבוב הפעיל לעולם אינו מכיל
 * את המבצע המקורי או את תשובות השחקנים האחרים. המידע הזה נחשף רק
 * ברגע שהסיבוב נסגר, במבנה {@link RoundResult}.
 */

import type { Difficulty, Song } from '../content/songs/index.js';

/** שלבי מכונת המצבים של המשחק. */
export type GamePhase =
  /** ממתינים לשחקנים; המנהל טרם התחיל. */
  | 'lobby'
  /** ספירה לאחור לפני הסיבוב הראשון. */
  | 'countdown'
  /** סיבוב פעיל — הטיימר רץ והשחקנים בוחרים תשובה. */
  | 'question'
  /** חשיפת התשובה הנכונה, לפני המעבר לסיבוב הבא. */
  | 'reveal'
  /** המשחק הופסק זמנית על ידי המנהל. */
  | 'paused'
  /** המשחק הסתיים — התוצאות זמינות. */
  | 'finished';

/** הגדרות משחק הנקבעות על ידי המנהל ביצירה. */
export interface GameSettings {
  /** מזהה חבילת השירים. */
  readonly packId: string;
  /** דרגת הקושי — קובעת מאיזה מאגר נשלפים השירים, אינה משפיעה על הניקוד. */
  readonly difficulty: Difficulty;
  /** מספר הסיבובים במשחק. */
  readonly roundCount: number;
  /** משך סיבוב במילישניות. */
  readonly roundDurationMs: number;
  /** משך חשיפת התשובה הנכונה בין סיבובים, במילישניות. */
  readonly revealMs: number;
  /** משך הספירה לאחור לפני הסיבוב הראשון במילישניות. */
  readonly countdownMs: number;
  /** האם לערבב את סדר השירים. */
  readonly shuffleQuestions: boolean;
  /** האם להציג לשחקן את מיקומו היחסי בדירוג במהלך המשחק. */
  readonly showLiveRank: boolean;
}

/**
 * ערכי ברירת המחדל למשחק חדש — דרגת קושי בינונית, 15 שניות לכל שיר.
 * שדה roundCount כאן הוא ערך גיבוי בלבד; בפועל השרת (ר' normalizeSettings)
 * וממסך יצירת המשחק קובעים ברירת מחדל דינמית השווה למספר כל השירים
 * במאגר שנבחר, כדי שהמשחק תמיד ישחק בכל התוכן הזמין כברירת מחדל.
 */
export const DEFAULT_SETTINGS: GameSettings = {
  packId: 'hebrew-classics',
  difficulty: 'medium',
  roundCount: 15,
  roundDurationMs: 15_000,
  revealMs: 5_000,
  countdownMs: 3_000,
  shuffleQuestions: true,
  showLiveRank: true,
};

/** גבולות תקינות להגדרות — נאכפים בשרת. */
export const SETTINGS_LIMITS = {
  roundCount: { min: 3, max: 30 },
  roundDurationMs: { min: 5_000, max: 60_000 },
  revealMs: { min: 2_000, max: 12_000 },
  countdownMs: { min: 0, max: 10_000 },
} as const;

/** אווטאר שנגזר דטרמיניסטית ממזהה השחקן. */
export interface Avatar {
  readonly emoji: string;
  readonly hue: number;
}

/** ייצוג ציבורי של שחקן — נשלח לכל המשתתפים. */
export interface PlayerPublic {
  readonly id: string;
  readonly name: string;
  readonly avatar: Avatar;
  /** האם החיבור פעיל כרגע. */
  readonly connected: boolean;
  /** ניקוד מצטבר. */
  readonly score: number;
  readonly joinedAt: number;
}

/** אפשרות תשובה בסיבוב — מיקומה מעורבב מחדש בכל סיבוב. */
export interface RoundOption {
  /** אינדקס בתוך מערך האפשרויות של הסיבוב הנוכחי (0–3). */
  readonly index: number;
  readonly artist: string;
}

/** תיאור הסיבוב הפעיל — ללא כל רמז למבצע המקורי. */
export interface RoundPrompt {
  /** אינדקס מבוסס-0. */
  readonly index: number;
  /** מספר הסיבובים הכולל. */
  readonly total: number;
  readonly songTitle: string;
  readonly year: number;
  /** ארבע אפשרויות, בסדר מעורבב — ללא ציון מי הנכונה. */
  readonly options: readonly RoundOption[];
  /** חותמת זמן שרת שבה הסיבוב נפתח. */
  readonly startsAt: number;
  /** חותמת זמן שרת שבה הסיבוב נסגר. */
  readonly endsAt: number;
}

/**
 * תמונת מצב ציבורית של החדר.
 * זהו המבנה היחיד שמשודר במהלך המשחק, ולכן הוא לא מכיל מידע רגיש.
 */
export interface PublicGameState {
  readonly code: string;
  readonly phase: GamePhase;
  readonly settings: GameSettings;
  /** שם חבילת השירים, לתצוגה. */
  readonly packName: string;
  /** הסיבוב הפעיל, או null בלובי/בחשיפה/בסיום. */
  readonly round: RoundPrompt | null;
  /** תוצאת הסיבוב האחרון שנחשפה, או null אם עדיין לא נחשף סיבוב. */
  readonly lastReveal: RoundResult | null;
  readonly players: readonly PlayerPublic[];
  /** כמה שחקנים כבר ענו בסיבוב הנוכחי (ללא חשיפת מה ענו). */
  readonly answeredCount: number;
  /** מספר הסיבובים שהושלמו. */
  readonly completedRounds: number;
  /** חותמת זמן שבה תסתיים הספירה לאחור / החשיפה הנוכחית. */
  readonly phaseEndsAt: number | null;
  /** האם המנהל מחובר כרגע. */
  readonly hostConnected: boolean;
}

/** תשובת שחקן בודדת — נחשפת רק כשסיבוב נסגר. */
export interface PlayerAnswerResult {
  readonly playerId: string;
  /** האפשרות שנבחרה, או null אם לא נענה. */
  readonly selectedIndex: number | null;
  readonly correct: boolean;
  readonly points: number;
  /** הזמן שחלף מתחילת הסיבוב ועד התשובה (מ"ש), או null. */
  readonly elapsedMs: number | null;
}

/** סיכום מלא של סיבוב — כולל השיר, המבצע האמיתי והתשובות. */
export interface RoundResult {
  readonly index: number;
  readonly song: Song;
  /** אותן אפשרויות שהוצגו לשחקנים, באותו סדר. */
  readonly options: readonly RoundOption[];
  /** האינדקס הנכון בתוך options. */
  readonly correctIndex: number;
  readonly answers: readonly PlayerAnswerResult[];
}

/** שורה בטבלת הדירוג הסופית. */
export interface LeaderboardEntry {
  /** דירוג מבוסס-1; שוויון מקבל את אותו דירוג. */
  readonly rank: number;
  readonly player: PlayerPublic;
  readonly totalPoints: number;
  /** מספר התשובות הנכונות. */
  readonly correctAnswers: number;
  /** מספר הסיבובים שנענו (נכון או לא). */
  readonly answeredRounds: number;
  /** הסיבוב המוצלח ביותר (אינדקס), אם קיים. */
  readonly bestRoundIndex: number | null;
}

/** התוצאות המלאות — נשלח רק כשהמשחק מסתיים. */
export interface GameResults {
  readonly code: string;
  readonly finishedAt: number;
  readonly settings: GameSettings;
  readonly packName: string;
  readonly rounds: readonly RoundResult[];
  readonly leaderboard: readonly LeaderboardEntry[];
  /** האם המשחק הופסק לפני סיום כל הסיבובים. */
  readonly endedEarly: boolean;
}

/** מצב פרטי המוחזר לשחקן בלבד. */
export interface PlayerPrivateState {
  readonly playerId: string;
  /** ניקוד מצטבר. */
  readonly score: number;
  /** דירוג נוכחי (1 = ראשון), או null אם ההגדרה כבויה. */
  readonly rank: number | null;
  /** מספר השחקנים, להצגת "מקום 3 מתוך 12". */
  readonly playerCount: number;
  /** האם כבר נבחרה תשובה בסיבוב הנוכחי. */
  readonly hasAnswered: boolean;
  /** האפשרות שנבחרה בסיבוב הנוכחי (המידע של השחקן עצמו בלבד). */
  readonly selectedIndex: number | null;
}
