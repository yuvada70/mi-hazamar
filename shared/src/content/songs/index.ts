/**
 * מרשם חבילות השירים (קטגוריות המשחק).
 *
 * חבילה = רשימת שירים המשויכת למאגר אחד. הוספת קטגוריה חדשה
 * ("שירי ילדים", "רוק ישראלי", "להיטי החורף") היא הוספת רשומה כאן
 * בלבד.
 */

import { HEBREW_CLASSICS } from './hebrew-classics.js';

/** דרגת קושי — קובעת אך ורק מאיזה מאגר נשלף השיר; אינה משפיעה על הניקוד. */
export type Difficulty = 'easy' | 'medium' | 'pro';

/** כל דרגות הקושי האפשריות, לבדיקת תקינות ולבניית בוררים. */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'pro'];

/** תוויות תצוגה בעברית לדרגת קושי. */
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'קל',
  medium: 'בינוני',
  pro: 'מקצוענים',
};

/** תיאור קצר לכל דרגת קושי, לתצוגה במסך יצירת המשחק. */
export const DIFFICULTY_DESCRIPTIONS: Readonly<Record<Difficulty, string>> = {
  easy: 'המבצע המקורי מוכר וברור לכולם',
  medium: 'דורש היכרות טובה עם הזמר העברי',
  pro: 'הגרסה המפורסמת היא כיסוי — המבצע המקורי מפתיע',
};

/** שיר שניתן לשאול עליו מי ביצע אותו במקור. */
export interface Song {
  /** מזהה יציב; משמש גם לשמירת תוצאות היסטוריות. */
  readonly id: string;
  /** שם השיר בעברית. */
  readonly title: string;
  /** המבצע/ת שהקליט/ה את השיר לראשונה — לא בהכרח מי שהפך אותו למפורסם. */
  readonly originalArtist: string;
  /** שנת הביצוע המקורי. */
  readonly year: number;
  readonly difficulty: Difficulty;
  /** בדיוק שלושה מסיחים — שמות מבצעים סבירים שאינם המבצע המקורי. */
  readonly distractors: readonly [string, string, string];
  /**
   * הערת מקור/אימות — מתועדת כשיש אפשרות בלבול עם גרסת כיסוי מפורסמת
   * יותר מהמקור, כדי שניתן יהיה לאמת מול המקור המצוין.
   */
  readonly note?: string;
}

/** חבילת שירים = קטגוריית משחק. */
export interface SongPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly songs: readonly Song[];
}

/** החבילה הראשית: להיטים עבריים מוכרים, בשלוש דרגות קושי. */
export const HEBREW_CLASSICS_PACK: SongPack = {
  id: 'hebrew-classics',
  name: 'להיטים עבריים',
  description: 'שירי מופת ולהיטים עבריים — מי ביצע אותם במקור?',
  songs: HEBREW_CLASSICS,
};

/** כל חבילות השירים הזמינות, לפי מזהה. */
export const SONG_PACKS: Readonly<Record<string, SongPack>> = {
  [HEBREW_CLASSICS_PACK.id]: HEBREW_CLASSICS_PACK,
};

/** חבילת ברירת המחדל למשחק חדש. */
export const DEFAULT_SONG_PACK_ID = HEBREW_CLASSICS_PACK.id;

/** מאתר חבילה לפי מזהה; זורק שגיאה מפורשת אם המזהה אינו מוכר. */
export function getSongPack(packId: string): SongPack {
  const pack = SONG_PACKS[packId];
  if (!pack) {
    throw new Error(`חבילת שירים לא מוכרת: "${packId}"`);
  }
  return pack;
}

/** רשימת החבילות לתצוגה במסך יצירת המשחק. */
export function listSongPacks(): readonly SongPack[] {
  return Object.values(SONG_PACKS);
}

/** מסנן את שירי החבילה לפי דרגת קושי — זהו מאגר השאלות שממנו נבחר המשחק בפועל. */
export function selectSongPool(pack: SongPack, difficulty: Difficulty): readonly Song[] {
  return pack.songs.filter((song) => song.difficulty === difficulty);
}
