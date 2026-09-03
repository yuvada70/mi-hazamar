/**
 * מסך המנהל במהלך המשחק.
 *
 * זהו המסך שמוקרן לקהל, ולכן הוא מציג רק את מה שמותר לחשוף: שם
 * השיר ושנתו, מספר הסיבוב, הטיימר וכמה כבר ענו — בלי אפשרויות
 * תשובה (המנהל אינו שחקן). בשלב החשיפה מוצג המבצע המקורי וטבלת
 * הניקוד המצטבר.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '../../components/ui/Button';
import { TimerRing } from '../../components/ui/TimerRing';
import { AvatarBadge } from '../../components/ui/misc';
import { useCountdown } from '../../hooks/useCountdown';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../state/gameStore';
import styles from './HostRound.module.css';

/** חלון זמן (התחלה/סוף) לספירה לאחור, נלכד כדי לשרוד הקפאה בהשהיה. */
interface TimeWindow {
  readonly start: number;
  readonly end: number;
}

export function HostRound(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const pauseGame = useGameStore((store) => store.pauseGame);
  const resumeGame = useGameStore((store) => store.resumeGame);
  const skipRound = useGameStore((store) => store.skipRound);
  const stopGame = useGameStore((store) => store.stopGame);

  const playSound = useSound();
  const [confirmingStop, setConfirmingStop] = useState(false);

  const round = room.round;
  const lastReveal = room.lastReveal;
  const isPaused = room.phase === 'paused';
  const answered = room.answeredCount;
  const total = room.players.length;

  /** השלב התוכני הנוכחי, נגזר מנוכחות round/lastReveal ולא רק מ-phase — כך גם מצב מושהה מוצג נכון. */
  const stage: 'countdown' | 'question' | 'reveal' = round ? 'question' : lastReveal ? 'reveal' : 'countdown';

  /* צליל בתחילת כל סיבוב חדש. */
  const lastRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!round || room.phase !== 'question') return;
    if (lastRoundRef.current === round.index) return;

    lastRoundRef.current = round.index;
    playSound('roundStart');
  }, [playSound, room.phase, round]);

  /* צליל בכל חשיפה. */
  const lastRevealRef = useRef<number | null>(null);
  useEffect(() => {
    if (!lastReveal || room.phase !== 'reveal') return;
    if (lastRevealRef.current === lastReveal.index) return;

    lastRevealRef.current = lastReveal.index;
    playSound('reveal');
  }, [lastReveal, playSound, room.phase]);

  /**
   * חלונות הזמן של הספירה לאחור והחשיפה נלכדים כשהם תקפים (phaseEndsAt
   * אינו null), כדי שכאשר המשחק מושהה — ו-phaseEndsAt מתאפס בשרת —
   * הטבעת עדיין תדע על אילו זמנים להקפיא.
   *
   * זה מצב (useState) ולא ref: הטבעת מותנית בקיומו, ולכן עדכון ref
   * בלבד (בלי לגרום לריצת רנדר נוספת) היה משאיר אותה בלתי-מוצגת עד
   * לרנדר הבא שייגרם מסיבה אחרת לגמרי.
   */
  const [countdownWindow, setCountdownWindow] = useState<TimeWindow | null>(null);
  const [revealWindow, setRevealWindow] = useState<TimeWindow | null>(null);

  useEffect(() => {
    if (room.phase === 'countdown' && room.phaseEndsAt !== null) {
      setCountdownWindow({ start: room.phaseEndsAt - room.settings.countdownMs, end: room.phaseEndsAt });
    }
  }, [room.phase, room.phaseEndsAt, room.settings.countdownMs]);

  useEffect(() => {
    if (room.phase === 'reveal' && room.phaseEndsAt !== null) {
      setRevealWindow({ start: room.phaseEndsAt - room.settings.revealMs, end: room.phaseEndsAt });
    }
  }, [room.phase, room.phaseEndsAt, room.settings.revealMs]);

  /** דירוג לפי ניקוד מצטבר — מותר להצגה במהלך המשחק. */
  const ranked = useMemo(
    () => [...room.players].sort((a, b) => b.score - a.score).slice(0, 10),
    [room.players],
  );

  /** תוספת הניקוד בסיבוב האחרון, ממוינת מהגבוה לנמוך — לתצוגת ה"עלייה" בחשיפה. */
  const revealDelta = useMemo(() => {
    if (!lastReveal) return [];
    const byId = new Map(room.players.map((player) => [player.id, player]));
    return [...lastReveal.answers]
      .filter((answer) => answer.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 6)
      .flatMap((answer) => {
        const player = byId.get(answer.playerId);
        return player ? [{ player, points: answer.points, correct: answer.correct }] : [];
      });
  }, [lastReveal, room.players]);

  const currentRoundNumber = (round?.index ?? lastReveal?.index ?? room.completedRounds - 1) + 1;
  const totalRounds = round?.total ?? room.settings.roundCount;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.progress}>
          <span className={styles.progressLabel}>סיבוב</span>
          <span className={`${styles.progressValue} tabular`}>
            {Math.max(1, currentRoundNumber)}
            <span className={styles.progressTotal}>/{totalRounds}</span>
          </span>
          {isPaused ? <span className={styles.pausedTag}>מושהה</span> : null}
        </div>

        <div className={styles.controls}>
          <Button variant="ghost" size="sm" onClick={() => void skipRound()} icon="⏭">
            דילוג
          </Button>
          {isPaused ? (
            <Button variant="secondary" size="sm" onClick={() => void resumeGame()} icon="▶">
              המשך
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => void pauseGame()} icon="⏸">
              עצירה זמנית
            </Button>
          )}
          {confirmingStop ? (
            <div className={styles.confirm}>
              <span className={styles.confirmText}>לסיים ולעבור לתוצאות?</span>
              <Button variant="danger" size="sm" onClick={() => void stopGame()}>
                כן, סיים
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingStop(false)}>
                ביטול
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmingStop(true)} icon="⏹">
              סיום משחק
            </Button>
          )}
        </div>
      </header>

      <main className={styles.stage}>
        <AnimatePresence mode="wait">
          {stage === 'countdown' ? (
            <Countdown key="countdown" window={countdownWindow} paused={isPaused} />
          ) : stage === 'question' && round ? (
            <motion.div
              key={`round-${round.index}`}
              className={styles.question}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles.prompt}>מי ביצע/ה במקור את השיר</span>
              <h1 className={styles.songTitle}>{round.songTitle}</h1>
              <span className={styles.songYear}>{round.year}</span>

              <TimerRing
                startsAt={round.startsAt}
                endsAt={round.endsAt}
                size={168}
                paused={isPaused}
                label={isPaused ? 'מוקפא' : 'שניות'}
              />

              <div className={styles.answered}>
                <div className={styles.answeredBar}>
                  <motion.div
                    className={styles.answeredFill}
                    animate={{ width: total > 0 ? `${(answered / total) * 100}%` : '0%' }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className={`${styles.answeredText} tabular`}>
                  {answered} מתוך {total} ענו
                </span>
              </div>
            </motion.div>
          ) : stage === 'reveal' && lastReveal ? (
            <motion.div
              key={`reveal-${lastReveal.index}`}
              className={styles.reveal}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles.prompt}>{lastReveal.song.title}</span>
              <h1 className={styles.revealArtist}>{lastReveal.song.originalArtist}</h1>
              <span className={styles.songYear}>{lastReveal.song.year}</span>

              {revealWindow ? (
                <TimerRing
                  startsAt={revealWindow.start}
                  endsAt={revealWindow.end}
                  size={96}
                  paused={isPaused}
                  label="הבא בעוד"
                />
              ) : null}

              {revealDelta.length > 0 ? (
                <ul className={styles.deltaList}>
                  {revealDelta.map(({ player, points }) => (
                    <li key={player.id} className={styles.deltaRow}>
                      <AvatarBadge avatar={player.avatar} size={26} />
                      <span className={styles.deltaName}>{player.name}</span>
                      <span className={`${styles.deltaPoints} tabular`}>+{points.toLocaleString('he-IL')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.deltaEmpty}>אף אחד לא ענה נכון בסיבוב הזה</p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="intermission"
              className={styles.intermission}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className={styles.intermissionIcon}>⏳</span>
              <p className={styles.intermissionText}>מתכוננים לשיר הבא…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <aside className={styles.scoreboard}>
        <h2 className={styles.scoreboardTitle}>ניקוד מצטבר</h2>
        <ul className={styles.scoreList}>
          {ranked.map((player, index) => (
            <motion.li key={player.id} className={styles.scoreRow} layout transition={{ duration: 0.4 }}>
              <span className={`${styles.scoreRank} tabular`}>{index + 1}</span>
              <AvatarBadge avatar={player.avatar} size={28} dimmed={!player.connected} />
              <span className={styles.scoreName}>{player.name}</span>
              <span className={`${styles.scoreValue} tabular`}>{player.score.toLocaleString('he-IL')}</span>
            </motion.li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** ספירה לאחור גדולה לפני הסיבוב הראשון. */
function Countdown({ window: timeWindow, paused }: { window: TimeWindow | null; paused: boolean }): JSX.Element {
  const { remainingMs } = useCountdown(timeWindow?.start ?? 0, timeWindow?.end ?? 0, paused || !timeWindow);
  const seconds = Math.max(1, Math.ceil(remainingMs / 1_000));

  return (
    <motion.div
      className={styles.countdown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
    >
      <span className={styles.countdownLabel}>מתחילים בעוד</span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={seconds}
          className={`${styles.countdownNumber} tabular`}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {seconds}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
