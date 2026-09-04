import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DIFFICULTIES, HEBREW_CLASSICS_PACK, selectSongPool } from './index.js';

describe('חבילת "להיטים עבריים"', () => {
  const { songs } = HEBREW_CLASSICS_PACK;

  it('לכל שיר מזהה ושם ייחודיים', () => {
    const ids = new Set(songs.map((s) => s.id));
    const titles = new Set(songs.map((s) => s.title));
    assert.equal(ids.size, songs.length);
    assert.equal(titles.size, songs.length);
  });

  it('לכל שיר בדיוק שלושה מסיחים, ואף אחד מהם אינו המבצע המקורי', () => {
    for (const song of songs) {
      assert.equal(song.distractors.length, 3, `${song.title}: מספר מסיחים שגוי`);
      const uniqueDistractors = new Set(song.distractors);
      assert.equal(uniqueDistractors.size, 3, `${song.title}: מסיחים כפולים`);
      for (const distractor of song.distractors) {
        assert.notEqual(
          distractor,
          song.originalArtist,
          `${song.title}: מסיח זהה למבצע המקורי`,
        );
      }
    }
  });

  it('לכל שיר שנה סבירה', () => {
    // 1900 ולא 1948 (הקמת המדינה): כמה שירי מאגר קדומים לה — כתיבה
    // עברית וזמר עברי חדש היו פעילים כבר בתקופת היישוב.
    const currentYear = new Date().getFullYear();
    for (const song of songs) {
      assert.ok(song.year >= 1900 && song.year <= currentYear, `${song.title}: שנה לא סבירה (${song.year})`);
    }
  });

  it('לכל דרגת קושי יש לפחות שיר אחד', () => {
    for (const difficulty of DIFFICULTIES) {
      const pool = selectSongPool(HEBREW_CLASSICS_PACK, difficulty);
      assert.ok(pool.length > 0, `אין שירים בדרגת קושי "${difficulty}"`);
    }
  });
});
