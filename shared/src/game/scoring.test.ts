import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SCORING, NO_ANSWER_SCORE, scoreAnswer } from './scoring.js';
import { buildLeaderboard, medalFor, topThree } from './leaderboard.js';
import type { PlayerPublic, RoundResult } from './types.js';

describe('scoreAnswer', () => {
  it('תשובה שגויה שווה תמיד 0, בכל זמן', () => {
    assert.equal(scoreAnswer(false, 0, 15_000).points, 0);
    assert.equal(scoreAnswer(false, 14_000, 15_000).points, 0);
    assert.equal(scoreAnswer(false, 0, 15_000).correct, false);
  });

  it('תשובה נכונה ומיידית מזכה בניקוד המרבי', () => {
    const result = scoreAnswer(true, 0, 15_000);
    assert.equal(result.correct, true);
    assert.equal(result.points, DEFAULT_SCORING.maxScore);
  });

  it('תשובה נכונה ברגע האחרון מזכה בניקוד המזערי', () => {
    const result = scoreAnswer(true, 15_000, 15_000);
    assert.equal(result.points, DEFAULT_SCORING.minScore);
  });

  it('הניקוד יורד באופן מונוטוני עם הזמן, ולעולם אינו נופל מתחת למינימום', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const elapsed of [0, 2_000, 5_000, 9_000, 12_000, 15_000, 20_000]) {
      const { points } = scoreAnswer(true, elapsed, 15_000);
      assert.ok(points <= previous, `ניקוד עלה במקום לרדת בזמן ${elapsed}`);
      assert.ok(points >= DEFAULT_SCORING.minScore, `ניקוד נמוך מהמינימום בזמן ${elapsed}`);
      previous = points;
    }
  });

  it('תשובה נכונה תמיד שווה יותר מתשובה שגויה, גם אם איטית מאוד', () => {
    const slowCorrect = scoreAnswer(true, 15_000, 15_000);
    const fastWrong = scoreAnswer(false, 0, 15_000);
    assert.ok(slowCorrect.points > fastWrong.points);
  });

  it('NO_ANSWER_SCORE שווה ל-0 נקודות ולא נכון', () => {
    assert.equal(NO_ANSWER_SCORE.points, 0);
    assert.equal(NO_ANSWER_SCORE.correct, false);
  });
});

describe('buildLeaderboard', () => {
  const player = (id: string, name: string): PlayerPublic => ({
    id,
    name,
    avatar: { emoji: '🦊', hue: 12 },
    connected: true,
    score: 0,
    joinedAt: 0,
  });
  const players = [player('a', 'אבי'), player('b', 'בני'), player('c', 'גדי')];

  const rounds: RoundResult[] = [
    {
      index: 0,
      song: {
        id: 's1',
        title: 'שיר א',
        originalArtist: 'זמר א',
        year: 1990,
        difficulty: 'easy',
        distractors: ['ל1', 'ל2', 'ל3'],
      },
      options: [
        { index: 0, artist: 'זמר א' },
        { index: 1, artist: 'ל1' },
        { index: 2, artist: 'ל2' },
        { index: 3, artist: 'ל3' },
      ],
      correctIndex: 0,
      answers: [
        { playerId: 'a', selectedIndex: 0, correct: true, points: 950, elapsedMs: 1_200 },
        { playerId: 'b', selectedIndex: 1, correct: false, points: 0, elapsedMs: 2_000 },
        { playerId: 'c', selectedIndex: null, correct: false, points: 0, elapsedMs: null },
      ],
    },
    {
      index: 1,
      song: {
        id: 's2',
        title: 'שיר ב',
        originalArtist: 'זמר ב',
        year: 1995,
        difficulty: 'easy',
        distractors: ['ל4', 'ל5', 'ל6'],
      },
      options: [
        { index: 0, artist: 'ל4' },
        { index: 1, artist: 'זמר ב' },
        { index: 2, artist: 'ל5' },
        { index: 3, artist: 'ל6' },
      ],
      correctIndex: 1,
      answers: [
        { playerId: 'a', selectedIndex: 1, correct: true, points: 800, elapsedMs: 4_000 },
        { playerId: 'b', selectedIndex: 1, correct: true, points: 1_000, elapsedMs: 100 },
        { playerId: 'c', selectedIndex: null, correct: false, points: 0, elapsedMs: null },
      ],
    },
  ];

  it('ממיין לפי ניקוד יורד ומדרג מ-1', () => {
    const board = buildLeaderboard(players, rounds);
    assert.deepEqual(board.map((e) => e.player.id), ['a', 'b', 'c']);
    assert.deepEqual(board.map((e) => e.rank), [1, 2, 3]);
    assert.equal(board[0]!.totalPoints, 1_750);
    assert.equal(board[1]!.totalPoints, 1_000);
    assert.equal(board[2]!.totalPoints, 0);
  });

  it('סופר תשובות נכונות וסיבובים שנענו', () => {
    const board = buildLeaderboard(players, rounds);
    const byId = new Map(board.map((entry) => [entry.player.id, entry]));
    assert.equal(byId.get('a')!.correctAnswers, 2);
    assert.equal(byId.get('a')!.answeredRounds, 2);
    assert.equal(byId.get('b')!.correctAnswers, 1);
    assert.equal(byId.get('b')!.answeredRounds, 2);
    assert.equal(byId.get('c')!.answeredRounds, 0);
  });

  it('מעניק אותו דירוג לשוויון ניקוד, ושובר שוויון לפי תשובות נכונות', () => {
    const tie: RoundResult[] = [
      {
        index: 0,
        song: {
          id: 's1',
          title: 'שיר א',
          originalArtist: 'זמר א',
          year: 1990,
          difficulty: 'easy',
          distractors: ['ל1', 'ל2', 'ל3'],
        },
        options: [
          { index: 0, artist: 'זמר א' },
          { index: 1, artist: 'ל1' },
          { index: 2, artist: 'ל2' },
          { index: 3, artist: 'ל3' },
        ],
        correctIndex: 0,
        answers: [
          { playerId: 'a', selectedIndex: 0, correct: true, points: 500, elapsedMs: 1 },
          { playerId: 'b', selectedIndex: 0, correct: true, points: 500, elapsedMs: 1 },
        ],
      },
    ];
    const board = buildLeaderboard(players.slice(0, 2), tie);
    assert.deepEqual(board.map((e) => e.rank), [1, 1]);
  });

  it('topThree ו-medalFor', () => {
    const board = buildLeaderboard(players, rounds);
    assert.equal(topThree(board).length, 3);
    assert.equal(medalFor(1), '🥇');
    assert.equal(medalFor(2), '🥈');
    assert.equal(medalFor(3), '🥉');
    assert.equal(medalFor(4), null);
  });
});
