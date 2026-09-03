/**
 * בדיקות מנוע המשחק.
 *
 * הבדיקות מריצות משחק שלם עם שעון מדומה, כך שהן דטרמיניסטיות
 * ומהירות ואינן תלויות בזמן אמת.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS, HEBREW_CLASSICS_PACK, selectSongPool } from '@mihazamar/shared';

import { GameError, GameRoom, normalizeSettings, type RoomListeners, type Scheduler } from './GameRoom.js';

/** מאגר ברירת המחדל (בינוני) — בסיס להשוואה בבדיקות. */
const DEFAULT_POOL_SIZE = selectSongPool(HEBREW_CLASSICS_PACK, DEFAULT_SETTINGS.difficulty).length;

/** שעון מדומה עם תור טיימרים — מאפשר "לקפוץ" קדימה בזמן. */
class FakeScheduler implements Scheduler {
  private current = 1_700_000_000_000;
  private nextId = 1;
  private readonly timers = new Map<number, { runAt: number; handler: () => void }>();

  now(): number {
    return this.current;
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { runAt: this.current + ms, handler });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** מקדם את השעון ומריץ את כל הטיימרים שהגיע זמנם, לפי הסדר. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextRunAt = Number.POSITIVE_INFINITY;

      for (const [id, timer] of this.timers) {
        if (timer.runAt <= target && timer.runAt < nextRunAt) {
          nextRunAt = timer.runAt;
          nextId = id;
        }
      }
      if (nextId === null) break;

      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.current = timer.runAt;
      timer.handler();
    }
    this.current = target;
  }
}

/** מאזין שמתעד את מה שנשלח החוצה, לצורך בדיקות. */
function createRecorder() {
  const stateEvents: unknown[] = [];
  const resultEvents: unknown[] = [];
  const listeners: RoomListeners = {
    onStateChanged: (room) => void stateEvents.push(room.getPublicState()),
    onResults: (_room, results) => void resultEvents.push(results),
    onPlayerStateChanged: () => {},
  };
  return { listeners, stateEvents, resultEvents };
}

function createRoom(overrides: Record<string, unknown> = {}) {
  const scheduler = new FakeScheduler();
  const recorder = createRecorder();
  const room = new GameRoom(
    'TEST1',
    { countdownMs: 1_000, roundDurationMs: 5_000, revealMs: 2_000, shuffleQuestions: false, ...overrides },
    recorder.listeners,
    scheduler,
  );
  return { room, scheduler, ...recorder };
}

/** מאתר את אינדקס האפשרות הנכונה/שגויה בסיבוב הנוכחי, לפי מאגר התוכן. */
function findOptions(room: GameRoom) {
  const round = room.getPublicState().round!;
  const song = HEBREW_CLASSICS_PACK.songs.find((s) => s.title === round.songTitle)!;
  const correct = round.options.find((o) => o.artist === song.originalArtist)!;
  const wrong = round.options.find((o) => o.artist !== song.originalArtist)!;
  return { song, correctIndex: correct.index, wrongIndex: wrong.index };
}

describe('הצטרפות שחקנים', () => {
  it('מקבל שם תקין ומייצר אווטאר', () => {
    const { room } = createRoom();
    const player = room.addPlayer('  דנה   כהן ', 'socket-1');

    assert.equal(player.name, 'דנה כהן');
    assert.ok(player.avatar.emoji.length > 0);
    assert.equal(room.playerCount, 1);
  });

  it('דוחה שם קצר מדי', () => {
    const { room } = createRoom();
    assert.throws(() => room.addPlayer('א', 'socket-1'), (error: GameError) => error.code === 'INVALID_NAME');
  });

  it('דוחה שם תפוס, ללא תלות ברישיות וברווחים', () => {
    const { room } = createRoom();
    room.addPlayer('דנה', 'socket-1');
    assert.throws(() => room.addPlayer(' דנה ', 'socket-2'), (error: GameError) => error.code === 'NAME_TAKEN');
  });

  it('מנקה תווי כיווניות בלתי נראים', () => {
    const { room } = createRoom();
    const player = room.addPlayer('‮דנה‬', 'socket-1');
    assert.equal(player.name, 'דנה');
  });

  it('שומר ניקוד בעת ניתוק ומחזירו בחיבור מחדש', () => {
    const { room } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');

    room.markPlayerDisconnected('socket-1');
    assert.equal(room.getPublicState().players[0]?.connected, false);

    room.reattachPlayer(player.id, 'socket-2');
    assert.equal(room.getPublicState().players[0]?.connected, true);
    assert.equal(room.playerCount, 1);
  });
});

describe('מהלך המשחק', () => {
  it('אינו מתחיל ללא שחקנים', () => {
    const { room } = createRoom();
    assert.throws(() => room.start(), (error: GameError) => error.code === 'NOT_ENOUGH_PLAYERS');
  });

  it('עובר ספירה לאחור ואז לסיבוב ראשון, עם ארבע אפשרויות ובלי לחשוף מי נכונה', () => {
    const { room, scheduler } = createRoom();
    room.addPlayer('דנה', 'socket-1');
    room.start();

    assert.equal(room.getPublicState().phase, 'countdown');
    assert.equal(room.getPublicState().round, null, 'אין לחשוף את השיר לפני שהסיבוב נפתח');

    scheduler.advance(1_000);
    const state = room.getPublicState();
    assert.equal(state.phase, 'question');
    assert.equal(state.round?.index, 0);
    assert.equal(state.round?.total, DEFAULT_POOL_SIZE);
    assert.equal(state.round?.options.length, 4);
  });

  it('המצב הציבורי לעולם אינו חושף את המבצע המקורי לפני החשיפה', () => {
    const { room, scheduler } = createRoom();
    room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    const { song } = findOptions(room);
    const serialized = JSON.stringify(room.getPublicState());
    // המבצע המקורי מותר להופיע רק כאחת מארבע האפשרויות המוצגות —
    // לא כשדה נפרד שמסגיר אותו כ"נכון".
    assert.equal(room.getPublicState().round?.songTitle, song.title);
    assert.ok(!serialized.includes('"correctIndex"'));
    assert.ok(!serialized.includes('"lastReveal":{"index"'));
  });

  it('מתקדם אוטומטית לשלב החשיפה ואז לסיבוב הבא בתום הזמן', () => {
    const { room, scheduler } = createRoom();
    room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    scheduler.advance(5_000);
    const revealState = room.getPublicState();
    assert.equal(revealState.phase, 'reveal');
    assert.equal(revealState.completedRounds, 1);
    assert.equal(revealState.lastReveal?.index, 0);
    assert.ok(typeof revealState.lastReveal?.correctIndex === 'number');

    scheduler.advance(2_000);
    assert.equal(room.getPublicState().round?.index, 1);
    assert.equal(room.getPublicState().lastReveal, null);
  });

  it('דוחה תשובה לאחר שהזמן הסתיים', () => {
    const { room, scheduler } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    const { correctIndex } = findOptions(room);
    room.submitAnswer(player.id, 0, correctIndex);
    scheduler.advance(5_000);

    assert.throws(
      () => room.submitAnswer(player.id, 0, correctIndex),
      (error: GameError) => error.code === 'ROUND_CLOSED',
    );
  });

  it('מאפשר לשנות את הבחירה כל עוד הסיבוב פתוח', () => {
    const { room, scheduler } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    const { correctIndex, wrongIndex } = findOptions(room);
    room.submitAnswer(player.id, 0, wrongIndex);
    room.submitAnswer(player.id, 0, correctIndex);

    const self = room.getPlayerState(player.id)!;
    assert.equal(self.hasAnswered, true);
    assert.equal(self.selectedIndex, correctIndex);
    assert.equal(room.getPublicState().answeredCount, 1);
  });

  it('דוחה אינדקס אפשרות לא תקין', () => {
    const { room, scheduler } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    assert.throws(
      () => room.submitAnswer(player.id, 0, 99),
      (error: GameError) => error.code === 'INVALID_INPUT',
    );
    assert.throws(
      () => room.submitAnswer(player.id, 0, -1),
      (error: GameError) => error.code === 'INVALID_INPUT',
    );
  });

  it('משלים משחק שלם ומפיק תוצאות מלאות', () => {
    const { room, scheduler, resultEvents } = createRoom({ roundCount: 3 });
    const dana = room.addPlayer('דנה', 'socket-1');
    const yoni = room.addPlayer('יוני', 'socket-2');

    room.start();
    scheduler.advance(1_000);

    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      // דנה עונה נכון, יוני עונה שגוי — כדי שהדירוג יהיה ודאי.
      const { correctIndex, wrongIndex } = findOptions(room);
      room.submitAnswer(dana.id, roundIndex, correctIndex);
      room.submitAnswer(yoni.id, roundIndex, wrongIndex);
      scheduler.advance(5_000);
      scheduler.advance(2_000);
    }

    assert.equal(room.getPublicState().phase, 'finished');
    assert.equal(resultEvents.length, 1);

    const results = room.getResults()!;
    assert.equal(results.rounds.length, 3);
    assert.equal(results.endedEarly, false);
    assert.equal(results.leaderboard.length, 2);
    assert.equal(results.leaderboard[0]!.player.name, 'דנה');
    assert.equal(results.leaderboard[0]!.rank, 1);
    assert.equal(results.leaderboard[0]!.correctAnswers, 3);
    assert.ok(results.leaderboard[0]!.totalPoints > results.leaderboard[1]!.totalPoints);

    // כל סיבוב מכיל את השיר המלא (כולל המבצע האמיתי) ואת תשובות כל השחקנים.
    for (const round of results.rounds) {
      assert.ok(round.song.originalArtist.length > 0);
      assert.equal(round.answers.length, 2);
    }
  });

  it('מזכה ב-0 נקודות סיבוב שלא נענה', () => {
    const { room, scheduler } = createRoom({ roundCount: 3 });
    room.addPlayer('דנה', 'socket-1');

    room.start();
    scheduler.advance(1_000);
    // עוברים את שלושת הסיבובים בלי לענות דבר (revealMs מברירת המחדל של הבדיקות: 2,000).
    scheduler.advance(3 * (5_000 + 2_000));

    const results = room.getResults()!;
    assert.equal(results.leaderboard[0]!.totalPoints, 0);
    assert.equal(results.leaderboard[0]!.answeredRounds, 0);
    for (const round of results.rounds) {
      assert.equal(round.answers[0]!.selectedIndex, null);
      assert.equal(round.answers[0]!.correct, false);
      assert.equal(round.answers[0]!.points, 0);
    }
  });
});

describe('שליטת המנהל', () => {
  it('הקפאה עוצרת את הטיימר וחידוש ממשיך מאותה נקודה', () => {
    const { room, scheduler } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    scheduler.advance(2_000);
    room.pause();
    assert.equal(room.getPublicState().phase, 'paused');

    // גם אם עובר הרבה זמן בהקפאה, הסיבוב לא נסגר.
    scheduler.advance(60_000);
    assert.equal(room.getPublicState().phase, 'paused');
    assert.equal(room.getPublicState().completedRounds, 0);

    room.resume();
    assert.equal(room.getPublicState().phase, 'question');

    // נותרו בדיוק 3 שניות.
    const { correctIndex } = findOptions(room);
    room.submitAnswer(player.id, 0, correctIndex);
    scheduler.advance(2_900);
    assert.equal(room.getPublicState().phase, 'question');
    scheduler.advance(200);
    assert.equal(room.getPublicState().completedRounds, 1);
  });

  it('דילוג סוגר את הסיבוב הנוכחי ופותח את הבא', () => {
    const { room, scheduler } = createRoom();
    room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);

    room.skip();
    assert.equal(room.getPublicState().completedRounds, 1);
    scheduler.advance(2_000);
    assert.equal(room.getPublicState().round?.index, 1);
  });

  it('עצירה מסיימת מיד ושומרת את התשובות שכבר נקלטו', () => {
    const { room, scheduler } = createRoom();
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);
    const { correctIndex } = findOptions(room);
    room.submitAnswer(player.id, 0, correctIndex);

    room.stop();

    const results = room.getResults()!;
    assert.equal(room.getPublicState().phase, 'finished');
    assert.equal(results.endedEarly, true);
    assert.equal(results.rounds.length, 1);
    assert.ok(results.rounds[0]!.answers[0]!.selectedIndex !== null);
  });

  it('משחק חדש מאפס ניקוד ושומר את השחקנים', () => {
    const { room, scheduler } = createRoom({ roundCount: 3 });
    const player = room.addPlayer('דנה', 'socket-1');
    room.start();
    scheduler.advance(1_000);
    const { correctIndex } = findOptions(room);
    room.submitAnswer(player.id, 0, correctIndex);
    scheduler.advance(3 * (5_000 + 2_000));
    assert.equal(room.getPublicState().phase, 'finished');
    assert.ok(room.getPublicState().players[0]!.score > 0);

    room.restart();
    const state = room.getPublicState();
    assert.equal(state.phase, 'lobby');
    assert.equal(state.players.length, 1);
    assert.equal(state.players[0]!.score, 0);
    assert.equal(room.getResults(), null);
  });

  it('אימות אסימון המנהל', () => {
    const { room } = createRoom();
    assert.equal(room.verifyHostToken(room.hostToken), true);
    assert.equal(room.verifyHostToken('לא-נכון'), false);
    assert.equal(room.verifyHostToken(''), false);
  });
});

describe('normalizeSettings', () => {
  it('משלים ברירות מחדל — מספר הסיבובים הוא כל שירי המאגר (בינוני)', () => {
    const settings = normalizeSettings({});
    assert.equal(settings.roundCount, DEFAULT_POOL_SIZE);
    assert.equal(settings.roundDurationMs, 15_000);
    assert.equal(settings.packId, 'hebrew-classics');
    assert.equal(settings.difficulty, 'medium');
  });

  it('מגביל ערכים חורגים לטווח המותר', () => {
    assert.equal(normalizeSettings({ roundCount: 9_999 }).roundCount, DEFAULT_POOL_SIZE);
    assert.equal(normalizeSettings({ roundCount: -5 }).roundCount, 3);
    assert.equal(normalizeSettings({ roundDurationMs: 1 }).roundDurationMs, 5_000);
    assert.equal(normalizeSettings({ roundDurationMs: 10 ** 9 }).roundDurationMs, 60_000);
  });

  it('מתעלם מחבילת תוכן לא מוכרת', () => {
    assert.equal(normalizeSettings({ packId: '../../etc/passwd' }).packId, 'hebrew-classics');
  });

  it('מתעלם מדרגת קושי לא מוכרת', () => {
    const settings = normalizeSettings({ difficulty: 'not-a-difficulty' as never });
    assert.equal(settings.difficulty, 'medium');
  });

  it('שולף מאגר שונה לפי דרגת קושי', () => {
    const easy = normalizeSettings({ difficulty: 'easy' });
    const pro = normalizeSettings({ difficulty: 'pro' });
    assert.equal(easy.roundCount, selectSongPool(HEBREW_CLASSICS_PACK, 'easy').length);
    assert.equal(pro.roundCount, selectSongPool(HEBREW_CLASSICS_PACK, 'pro').length);
  });

  it('עמיד בפני קלט שאינו מספר', () => {
    const settings = normalizeSettings({ roundCount: 'הרבה' as unknown as number });
    assert.equal(settings.roundCount, DEFAULT_POOL_SIZE);
  });
});
