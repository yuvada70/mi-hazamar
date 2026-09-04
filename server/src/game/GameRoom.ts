/**
 * חדר משחק — מכונת המצבים המלאה של משחק יחיד.
 *
 * החדר הוא מקור האמת היחיד: הוא מחזיק את השחקנים, את סדר השירים,
 * את התשובות ואת התוצאות, והוא היחיד שמודד זמן. הלקוחות מציגים
 * בלבד. גישה כזו מונעת רמאות (המבצע המקורי לעולם אינו נמצא בצד
 * הלקוח לפני שהסיבוב נסגר) ומבטיחה שכל המשתתפים רואים אותו מצב.
 *
 * בניגוד למשחקים שמסתירים הכול עד הסוף, כאן התשובה הנכונה נחשפת
 * מיד בתום כל סיבוב (שלב "reveal") — כדי לאפשר "טבלת מובילים בין
 * הסיבובים", בדיוק כמו במשחקי חידון קבוצתיים מוכרים.
 *
 * החדר אינו יודע דבר על Socket.IO או על HTTP — הוא מדווח על שינויים
 * דרך callbacks. כך ניתן לבדוק אותו ביחידות ולהחליף את שכבת התקשורת.
 */

import { randomUUID } from 'node:crypto';

import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  MAX_PLAYERS_PER_ROOM,
  NO_ANSWER_SCORE,
  SETTINGS_LIMITS,
  buildLeaderboard,
  createAvatar,
  getSongPack,
  normalizeNameForComparison,
  sanitizePlayerName,
  scoreAnswer,
  selectSongPool,
  type Difficulty,
  type ErrorCode,
  type GameResults,
  type GameSettings,
  type PlayerPrivateState,
  type PlayerPublic,
  type PublicGameState,
  type RoundOption,
  type RoundResult,
  type Song,
} from '@mihazamar/shared';

/** רשומת שחקן פנימית — מכילה גם מידע סודי שאינו משודר. */
export interface PlayerRecord {
  readonly id: string;
  /** אסימון חיבור מחדש; לעולם אינו נשלח לשחקנים אחרים. */
  readonly token: string;
  name: string;
  readonly avatar: { emoji: string; hue: number };
  readonly joinedAt: number;
  score: number;
  connected: boolean;
  /** מזהה החיבור הפעיל, אם קיים. */
  socketId: string | null;
}

/** תשובה שנקלטה בסיבוב פעיל. */
interface PendingAnswer {
  optionIndex: number;
  /** הזמן שחלף מפתיחת הסיבוב, במילישניות. */
  elapsedMs: number;
}

/** שגיאה עסקית עם קוד יציב שהשרת מתרגם לתשובת Ack. */
export class GameError extends Error {
  constructor(readonly code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GameError';
  }
}

/** התראות שהחדר מפיץ החוצה. */
export interface RoomListeners {
  /** נקרא בכל שינוי במצב הציבורי. */
  onStateChanged(room: GameRoom): void;
  /** נקרא כשהמשחק מסתיים והתוצאות מוכנות. */
  onResults(room: GameRoom, results: GameResults): void;
  /** נקרא כשמצבו הפרטי של שחקן מסוים השתנה. */
  onPlayerStateChanged(room: GameRoom, playerId: string): void;
}

/** מנשק מתזמן — מוזרק כדי לאפשר בדיקות עם שעון מדומה. */
export interface Scheduler {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** מתזמן ברירת המחדל, מעל שעון המערכת. */
export const systemScheduler: Scheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** מרווח חסד לקליטת תשובות שיצאו לפני תום הזמן והתעכבו ברשת. */
const NETWORK_GRACE_MS = 750;

/**
 * חדר משחק יחיד.
 */
export class GameRoom {
  readonly code: string;
  readonly hostToken: string;
  readonly createdAt: number;

  private settings: GameSettings;
  private phase: PublicGameState['phase'] = 'lobby';
  private readonly players = new Map<string, PlayerRecord>();

  /** סדר השירים שנבחר בתחילת המשחק. */
  private songs: readonly Song[] = [];
  private currentRoundIndex = -1;
  /** אפשרויות התשובה של הסיבוב הנוכחי, בסדר מעורבב. */
  private currentOptions: readonly RoundOption[] = [];
  private currentCorrectIndex = -1;
  private roundStartsAt = 0;
  private roundEndsAt = 0;
  /** מתי מסתיים השלב הנוכחי (ספירה לאחור / חשיפה). */
  private phaseEndsAt: number | null = null;
  /** הזמן שנותר בשלב שהוקפא, כדי לחדשו במדויק. */
  private pausedRemainingMs: number | null = null;
  private phaseBeforePause: PublicGameState['phase'] | null = null;

  private readonly answers = new Map<string, PendingAnswer>();
  private completedRounds: RoundResult[] = [];
  private lastReveal: RoundResult | null = null;
  private results: GameResults | null = null;

  private timerHandle: unknown = null;
  private hostSocketId: string | null = null;
  /** חותמת הפעילות האחרונה — משמשת לניקוי חדרים נטושים. */
  lastActivityAt: number;

  constructor(
    code: string,
    settings: Partial<GameSettings>,
    private readonly listeners: RoomListeners,
    private readonly scheduler: Scheduler = systemScheduler,
  ) {
    this.code = code;
    this.hostToken = randomUUID();
    this.createdAt = scheduler.now();
    this.lastActivityAt = this.createdAt;
    this.settings = normalizeSettings(settings);
  }

  // ────────────────────────────────────────────────────────────
  //  קריאה
  // ────────────────────────────────────────────────────────────

  /** מצב ציבורי — ללא מבצע מקורי או תשובות שחקנים, מלבד סיבוב שכבר נחשף. */
  getPublicState(): PublicGameState {
    const pack = getSongPack(this.settings.packId);
    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      packName: pack.name,
      round:
        this.phase === 'question' || (this.phase === 'paused' && this.phaseBeforePause === 'question')
          ? this.currentPrompt()
          : null,
      lastReveal: this.phase === 'reveal' || (this.phase === 'paused' && this.phaseBeforePause === 'reveal')
        ? this.lastReveal
        : null,
      players: this.listPlayers(),
      answeredCount: this.answers.size,
      completedRounds: this.completedRounds.length,
      phaseEndsAt: this.phaseEndsAt,
      hostConnected: this.hostSocketId !== null,
    };
  }

  /** מצב פרטי של שחקן בודד. */
  getPlayerState(playerId: string): PlayerPrivateState | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const answer = this.answers.get(playerId);
    return {
      playerId,
      score: player.score,
      rank: this.settings.showLiveRank ? this.rankOf(playerId) : null,
      playerCount: this.players.size,
      hasAnswered: answer !== undefined,
      selectedIndex: answer?.optionIndex ?? null,
    };
  }

  /** התוצאות המלאות, אם המשחק הסתיים. */
  getResults(): GameResults | null {
    return this.results;
  }

  /** מספר השחקנים בחדר. */
  get playerCount(): number {
    return this.players.size;
  }

  /** האם החדר ריק לגמרי (אין מנהל מחובר ואין שחקנים מחוברים). */
  get isDormant(): boolean {
    if (this.hostSocketId !== null) return false;
    for (const player of this.players.values()) {
      if (player.connected) return false;
    }
    return true;
  }

  /** מאמת שהאסימון שייך למנהל החדר. */
  verifyHostToken(token: string): boolean {
    return timingSafeEquals(token, this.hostToken);
  }

  /** מאתר שחקן לפי אסימון חיבור מחדש. */
  findPlayerByToken(token: string): PlayerRecord | null {
    for (const player of this.players.values()) {
      if (timingSafeEquals(token, player.token)) return player;
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────
  //  ניהול חיבורים
  // ────────────────────────────────────────────────────────────

  /** רושם את חיבור המנהל. */
  attachHost(socketId: string): void {
    this.hostSocketId = socketId;
    this.touch();
    this.emitState();
  }

  /** מנתק את המנהל (החדר נשמר עד לפקיעת התוקף). */
  detachHost(socketId: string): void {
    if (this.hostSocketId !== socketId) return;
    this.hostSocketId = null;
    this.touch();
    this.emitState();
  }

  /** מזהה החיבור של המנהל, אם מחובר. */
  get hostSocket(): string | null {
    return this.hostSocketId;
  }

  /**
   * מצרף שחקן חדש.
   * @throws {GameError} כשהשם אינו תקין, תפוס, או שהחדר מלא.
   */
  addPlayer(rawName: string, socketId: string): PlayerRecord {
    const name = sanitizePlayerName(rawName);
    if (name.length < 2) throw new GameError('INVALID_NAME');
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) throw new GameError('ROOM_FULL');

    const normalized = normalizeNameForComparison(name);
    for (const existing of this.players.values()) {
      if (normalizeNameForComparison(existing.name) === normalized) {
        throw new GameError('NAME_TAKEN');
      }
    }

    const id = randomUUID();
    const player: PlayerRecord = {
      id,
      token: randomUUID(),
      name,
      avatar: createAvatar(id),
      joinedAt: this.scheduler.now(),
      score: 0,
      connected: true,
      socketId,
    };

    this.players.set(id, player);
    this.touch();
    this.emitState();
    return player;
  }

  /** מחבר מחדש שחקן קיים לאחר רענון או ניתוק. */
  reattachPlayer(playerId: string, socketId: string): PlayerRecord {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('NOT_AUTHORIZED');

    player.socketId = socketId;
    player.connected = true;
    this.touch();
    this.emitState();
    return player;
  }

  /** מסמן שחקן כמנותק, אך שומר את ניקודו לחיבור מחדש. */
  markPlayerDisconnected(socketId: string): void {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) {
        player.socketId = null;
        player.connected = false;
        this.touch();
        this.emitState();
        return;
      }
    }
  }

  /** מסיר שחקן לצמיתות (יציאה יזומה או הרחקה על ידי המנהל). */
  removePlayer(playerId: string): PlayerRecord | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    this.answers.delete(playerId);
    this.touch();
    this.emitState();
    return player;
  }

  // ────────────────────────────────────────────────────────────
  //  פקודות המנהל
  // ────────────────────────────────────────────────────────────

  /** מעדכן הגדרות. מותר בלובי בלבד. */
  updateSettings(partial: Partial<GameSettings>): void {
    if (this.phase !== 'lobby') throw new GameError('GAME_ALREADY_STARTED');
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    this.touch();
    this.emitState();
  }

  /** מתחיל את המשחק: בוחר שירים, מאפס ניקוד ומפעיל ספירה לאחור. */
  start(): void {
    if (this.phase !== 'lobby') throw new GameError('GAME_ALREADY_STARTED');
    if (this.players.size === 0) throw new GameError('NOT_ENOUGH_PLAYERS');

    this.songs = selectSongs(this.settings);
    this.completedRounds = [];
    this.lastReveal = null;
    this.results = null;
    this.currentRoundIndex = -1;
    this.answers.clear();
    for (const player of this.players.values()) player.score = 0;

    this.touch();

    if (this.settings.countdownMs > 0) {
      this.phase = 'countdown';
      this.phaseEndsAt = this.scheduler.now() + this.settings.countdownMs;
      this.emitState();
      this.scheduleIn(this.settings.countdownMs, () => this.beginRound(0));
    } else {
      this.beginRound(0);
    }
  }

  /** מקפיא את המשחק ושומר את יתרת הזמן במדויק. */
  pause(): void {
    if (this.phase !== 'question' && this.phase !== 'reveal' && this.phase !== 'countdown') {
      throw new GameError('NOT_AUTHORIZED');
    }

    this.clearTimer();
    const target = this.phase === 'question' ? this.roundEndsAt : (this.phaseEndsAt ?? 0);
    this.pausedRemainingMs = Math.max(0, target - this.scheduler.now());
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.phaseEndsAt = null;
    this.touch();
    this.emitState();
  }

  /** מחדש משחק שהוקפא מאותה נקודה בדיוק. */
  resume(): void {
    if (this.phase !== 'paused' || this.phaseBeforePause === null) {
      throw new GameError('NOT_AUTHORIZED');
    }

    const remaining = this.pausedRemainingMs ?? 0;
    const previousPhase = this.phaseBeforePause;
    this.phase = previousPhase;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;
    this.touch();

    if (previousPhase === 'question') {
      // שומרים על משך הסיבוב שנותר, ומזיזים גם את נקודת ההתחלה
      // כדי שחישוב זמני התגובה יישאר עקבי.
      const now = this.scheduler.now();
      const elapsed = this.roundEndsAt - this.roundStartsAt - remaining;
      this.roundStartsAt = now - elapsed;
      this.roundEndsAt = now + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.closeRound(true));
    } else if (previousPhase === 'countdown') {
      this.phaseEndsAt = this.scheduler.now() + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.beginRound(0));
    } else {
      this.phaseEndsAt = this.scheduler.now() + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.beginRound(this.currentRoundIndex + 1));
    }
  }

  /** מדלג לשלב הבא מיד, בלי להמתין לטיימר. */
  skip(): void {
    if (this.phase === 'question') {
      this.clearTimer();
      this.closeRound(true);
      return;
    }
    if (this.phase === 'reveal' || this.phase === 'countdown') {
      this.clearTimer();
      const nextIndex = this.phase === 'countdown' ? 0 : this.currentRoundIndex + 1;
      this.beginRound(nextIndex);
      return;
    }
    throw new GameError('NOT_AUTHORIZED');
  }

  /** עוצר את המשחק ועובר מיד לתוצאות. */
  stop(): void {
    if (this.phase === 'lobby' || this.phase === 'finished') {
      throw new GameError('NOT_AUTHORIZED');
    }

    this.clearTimer();
    if (this.phase === 'question' || (this.phase === 'paused' && this.phaseBeforePause === 'question')) {
      // הסיבוב הפעיל עדיין נספר — התשובות שכבר נקלטו לא הולכות לאיבוד.
      this.closeRound(false);
    }
    this.finish(true);
  }

  /** מאפס את החדר למשחק חדש עם אותם שחקנים. */
  restart(): void {
    this.clearTimer();
    this.phase = 'lobby';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;
    this.currentRoundIndex = -1;
    this.currentOptions = [];
    this.currentCorrectIndex = -1;
    this.songs = [];
    this.completedRounds = [];
    this.lastReveal = null;
    this.results = null;
    this.answers.clear();
    for (const player of this.players.values()) player.score = 0;

    this.touch();
    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);
  }

  // ────────────────────────────────────────────────────────────
  //  פעולות שחקן
  // ────────────────────────────────────────────────────────────

  /**
   * קולט תשובה של שחקן. ניתן לשנות את הבחירה כל עוד הסיבוב פתוח;
   * לאחר תום הזמן התשובה נדחית.
   *
   * @throws {GameError} כשהסיבוב סגור או הקלט אינו תקין.
   */
  submitAnswer(playerId: string, roundIndex: number, optionIndex: unknown): void {
    if (this.phase !== 'question') throw new GameError('ROUND_CLOSED');
    if (roundIndex !== this.currentRoundIndex) throw new GameError('ROUND_CLOSED');
    if (!this.players.has(playerId)) throw new GameError('NOT_AUTHORIZED');
    if (
      typeof optionIndex !== 'number' ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= this.currentOptions.length
    ) {
      throw new GameError('INVALID_INPUT');
    }

    const now = this.scheduler.now();
    if (now > this.roundEndsAt + NETWORK_GRACE_MS) throw new GameError('ROUND_CLOSED');

    this.answers.set(playerId, {
      optionIndex,
      elapsedMs: Math.max(0, Math.min(now - this.roundStartsAt, this.settings.roundDurationMs)),
    });

    this.touch();
    this.emitState();
    this.listeners.onPlayerStateChanged(this, playerId);
  }

  // ────────────────────────────────────────────────────────────
  //  מכונת המצבים הפנימית
  // ────────────────────────────────────────────────────────────

  /** פותח סיבוב חדש, או מסיים את המשחק אם נגמרו השירים. */
  private beginRound(index: number): void {
    if (index >= this.songs.length) {
      this.finish(false);
      return;
    }

    const song = this.songs[index]!;
    const { options, correctIndex } = buildRoundOptions(song);

    this.currentRoundIndex = index;
    this.currentOptions = options;
    this.currentCorrectIndex = correctIndex;
    this.lastReveal = null;
    this.answers.clear();
    this.phase = 'question';
    this.roundStartsAt = this.scheduler.now();
    this.roundEndsAt = this.roundStartsAt + this.settings.roundDurationMs;
    this.phaseEndsAt = this.roundEndsAt;

    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);

    this.scheduleIn(this.settings.roundDurationMs, () => this.closeRound(true));
  }

  /**
   * סוגר את הסיבוב הפעיל: מחשב ניקוד, מעדכן צבירה וחושף את התשובה.
   * @param advance האם להמשיך אוטומטית לשלב החשיפה.
   */
  private closeRound(advance: boolean): void {
    const song = this.songs[this.currentRoundIndex];
    if (!song) return;

    const answers = [...this.players.values()].map((player) => {
      const answer = this.answers.get(player.id);
      if (!answer) {
        return {
          playerId: player.id,
          selectedIndex: null,
          correct: false,
          points: NO_ANSWER_SCORE.points,
          elapsedMs: null,
        };
      }

      const correct = answer.optionIndex === this.currentCorrectIndex;
      const score = scoreAnswer(correct, answer.elapsedMs, this.settings.roundDurationMs);
      player.score += score.points;

      return {
        playerId: player.id,
        selectedIndex: answer.optionIndex,
        correct,
        points: score.points,
        elapsedMs: answer.elapsedMs,
      };
    });

    const result: RoundResult = {
      index: this.currentRoundIndex,
      song,
      options: this.currentOptions,
      correctIndex: this.currentCorrectIndex,
      answers,
    };
    this.completedRounds.push(result);
    this.answers.clear();

    if (!advance) return;

    this.lastReveal = result;
    this.phase = 'reveal';
    this.phaseEndsAt = this.scheduler.now() + this.settings.revealMs;
    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);

    this.scheduleIn(this.settings.revealMs, () => this.beginRound(this.currentRoundIndex + 1));
  }

  /** מסיים את המשחק ובונה את התוצאות. */
  private finish(endedEarly: boolean): void {
    this.clearTimer();
    this.phase = 'finished';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;
    this.lastReveal = null;

    const pack = getSongPack(this.settings.packId);
    const players = this.listPlayers();
    this.results = {
      code: this.code,
      finishedAt: this.scheduler.now(),
      settings: this.settings,
      packName: pack.name,
      rounds: this.completedRounds,
      leaderboard: buildLeaderboard(players, this.completedRounds),
      endedEarly,
    };

    this.touch();
    this.emitState();
    this.listeners.onResults(this, this.results);
  }

  // ────────────────────────────────────────────────────────────
  //  עזר
  // ────────────────────────────────────────────────────────────

  private currentPrompt(): PublicGameState['round'] {
    const song = this.songs[this.currentRoundIndex];
    if (!song) return null;

    return {
      index: this.currentRoundIndex,
      total: this.songs.length,
      songTitle: song.title,
      year: song.year,
      options: this.currentOptions,
      startsAt: this.roundStartsAt,
      endsAt: this.roundEndsAt,
    };
  }

  private listPlayers(): PlayerPublic[] {
    return [...this.players.values()]
      .map(({ id, name, avatar, connected, score, joinedAt }) => ({
        id,
        name,
        avatar,
        connected,
        score,
        joinedAt,
      }))
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  }

  /** דירוג נוכחי של שחקן (1 = ראשון), עם דירוג זהה לניקוד זהה. */
  private rankOf(playerId: string): number | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    let higher = 0;
    for (const other of this.players.values()) {
      if (other.score > player.score) higher += 1;
    }
    return higher + 1;
  }

  private scheduleIn(ms: number, handler: () => void): void {
    this.clearTimer();
    this.timerHandle = this.scheduler.setTimeout(() => {
      this.timerHandle = null;
      handler();
    }, Math.max(0, ms));
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private emitState(): void {
    this.listeners.onStateChanged(this);
  }

  private touch(): void {
    this.lastActivityAt = this.scheduler.now();
  }

  /** משחרר משאבים בעת סגירת החדר. */
  dispose(): void {
    this.clearTimer();
    this.players.clear();
    this.answers.clear();
  }
}

/** מגביל ערך לטווח מותר. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * מנרמל הגדרות שהגיעו מהלקוח: משלים ערכי ברירת מחדל, מגביל לטווחים
 * המותרים ומוודא שהחבילה קיימת. שכבת ההגנה הזו הכרחית — הלקוח אינו מהימן.
 */
export function normalizeSettings(partial: Partial<GameSettings>): GameSettings {
  const packId = typeof partial.packId === 'string' && isKnownPack(partial.packId)
    ? partial.packId
    : DEFAULT_SETTINGS.packId;

  const difficulty = isValidDifficulty(partial.difficulty) ? partial.difficulty : DEFAULT_SETTINGS.difficulty;

  const pack = getSongPack(packId);
  const pool = selectSongPool(pack, difficulty);
  const maxRounds = Math.min(SETTINGS_LIMITS.roundCount.max, pool.length);
  // ברירת המחדל היא הערך הקבוע (10, ר' DEFAULT_SETTINGS) — אך אם
  // במאגר שנבחר יש פחות שירים מזה, מצמצמים למה שיש בפועל.
  const defaultRoundCount = Math.min(DEFAULT_SETTINGS.roundCount, maxRounds);

  return {
    packId,
    difficulty,
    roundCount: clamp(
      Math.round(Number(partial.roundCount ?? defaultRoundCount)) || defaultRoundCount,
      SETTINGS_LIMITS.roundCount.min,
      maxRounds,
    ),
    roundDurationMs: clamp(
      Math.round(Number(partial.roundDurationMs ?? DEFAULT_SETTINGS.roundDurationMs)) ||
        DEFAULT_SETTINGS.roundDurationMs,
      SETTINGS_LIMITS.roundDurationMs.min,
      SETTINGS_LIMITS.roundDurationMs.max,
    ),
    revealMs: clamp(
      Math.round(Number(partial.revealMs ?? DEFAULT_SETTINGS.revealMs)) || DEFAULT_SETTINGS.revealMs,
      SETTINGS_LIMITS.revealMs.min,
      SETTINGS_LIMITS.revealMs.max,
    ),
    countdownMs: clamp(
      Math.round(Number(partial.countdownMs ?? DEFAULT_SETTINGS.countdownMs)),
      SETTINGS_LIMITS.countdownMs.min,
      SETTINGS_LIMITS.countdownMs.max,
    ),
    shuffleQuestions: partial.shuffleQuestions ?? DEFAULT_SETTINGS.shuffleQuestions,
    showLiveRank: partial.showLiveRank ?? DEFAULT_SETTINGS.showLiveRank,
  };
}

function isKnownPack(packId: string): boolean {
  try {
    getSongPack(packId);
    return true;
  } catch {
    return false;
  }
}

function isValidDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** בוחר את שירי המשחק לפי ההגדרות (ערבוב Fisher–Yates אם התבקש). */
function selectSongs(settings: GameSettings): readonly Song[] {
  const pack = getSongPack(settings.packId);
  const all = [...selectSongPool(pack, settings.difficulty)];

  if (settings.shuffleQuestions) {
    shuffleInPlace(all);
  }

  return all.slice(0, settings.roundCount);
}

/** בונה את ארבע אפשרויות התשובה לסיבוב, בסדר מעורבב, ומחזיר גם את האינדקס הנכון. */
function buildRoundOptions(song: Song): { options: readonly RoundOption[]; correctIndex: number } {
  const artists = shuffleInPlace([song.originalArtist, ...song.distractors]);
  const options = artists.map((artist, index) => ({ index, artist }));
  const correctIndex = artists.indexOf(song.originalArtist);
  return { options, correctIndex };
}

/** ערבוב Fisher–Yates במקום; מחזיר את אותו מערך לנוחות שרשור קריאות. */
function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = items[i]!;
    const b = items[j]!;
    items[i] = b;
    items[j] = a;
  }
  return items;
}

/**
 * השוואת מחרוזות בזמן קבוע — מונעת דליפת מידע דרך מדידת זמן
 * בעת אימות אסימונים.
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
