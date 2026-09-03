/**
 * מסך המשחק של השחקן — הלב של החוויה.
 *
 * ארבע כרטיסיות תשובה גדולות, כל אחת בצבע ובסמל קבועים לפי מיקומה
 * (כמו במשחקי טריוויה מוכרים) — כך הבחירה מהירה וברורה גם במבט חטוף
 * בטלפון. אפשר לשנות את הבחירה עד שהסיבוב נסגר. בשלב החשיפה
 * מודגשת התשובה הנכונה, ואם טעינו — גם הבחירה השגויה שלנו.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { TimerRing } from '../../components/ui/TimerRing';
import { useSound } from '../../hooks/useSound';
import { selectMe, useGameStore } from '../../state/gameStore';
import styles from './PlayerRound.module.css';

/** סמל וגוון קבועים לכל אחד מארבעת מיקומי התשובה. */
const OPTION_STYLE = [
  { icon: '▲', tone: 'a' },
  { icon: '◆', tone: 'b' },
  { icon: '●', tone: 'c' },
  { icon: '■', tone: 'd' },
] as const;

export function PlayerRound(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const self = useGameStore((store) => store.self);
  const playerId = useGameStore((store) => store.playerId);
  const submitAnswer = useGameStore((store) => store.submitAnswer);
  const me = useGameStore(selectMe);

  const playSound = useSound();
  const round = room.round;
  const lastReveal = room.lastReveal;
  const isPaused = room.phase === 'paused';
  const isQuestion = room.phase === 'question' && round !== null;

  /** בחירה מקומית אופטימית — מוצגת מיד, לפני אישור השרת. */
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  useEffect(() => {
    setPendingIndex(null);
  }, [round?.index]);

  const handlePick = (optionIndex: number) => {
    if (!isQuestion || !round || isPaused) return;
    if (pendingIndex !== optionIndex) {
      setPendingIndex(optionIndex);
      playSound('select');
      navigator.vibrate?.(16);
      void submitAnswer(round.index, optionIndex);
    }
  };

  const selection = pendingIndex ?? self?.selectedIndex ?? null;

  const ownReveal = useMemo(
    () => lastReveal?.answers.find((answer) => answer.playerId === playerId) ?? null,
    [lastReveal, playerId],
  );

  /* צליל תוצאה בכל חשיפה חדשה. */
  const revealSoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!lastReveal || room.phase !== 'reveal') return;
    if (revealSoundRef.current === lastReveal.index) return;

    revealSoundRef.current = lastReveal.index;
    playSound(ownReveal?.correct ? 'correct' : 'wrong');
  }, [lastReveal, ownReveal, playSound, room.phase]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerSide}>
          <span className={styles.roundLabel}>
            שיר <span className="tabular">{(round?.index ?? lastReveal?.index ?? room.completedRounds) + 1}</span>
            <span className={styles.roundTotal}>/{round?.total ?? room.settings.roundCount}</span>
          </span>
        </div>

        {isQuestion && round ? (
          <TimerRing startsAt={round.startsAt} endsAt={round.endsAt} size={62} paused={isPaused} />
        ) : (
          <span className={styles.headerSpacer} />
        )}

        <div className={`${styles.headerSide} ${styles.headerEnd}`}>
          <span className={`${styles.score} tabular`}>{(me?.score ?? 0).toLocaleString('he-IL')}</span>
          <span className={styles.scoreLabel}>נקודות</span>
          {room.settings.showLiveRank && self?.rank ? (
            <span className={styles.rank}>
              מקום {self.rank} מתוך {self.playerCount}
            </span>
          ) : null}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {isQuestion && round ? (
          <motion.div
            key={`prompt-${round.index}`}
            className={styles.promptBlock}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className={styles.prompt}>{round.songTitle}</h1>
            <span className={styles.promptYear}>{round.year}</span>
          </motion.div>
        ) : (
          <motion.h1
            key="waiting-prompt"
            className={`${styles.prompt} ${styles.promptMuted}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {room.phase === 'countdown'
              ? 'מתכוננים…'
              : isPaused
                ? 'המשחק מושהה'
                : room.phase === 'reveal'
                  ? lastReveal?.song.title
                  : 'השיר הבא בדרך'}
          </motion.h1>
        )}
      </AnimatePresence>

      <div className={styles.stage}>
        {isQuestion && round ? (
          <div className={styles.options}>
            {round.options.map((option) => {
              const style = OPTION_STYLE[option.index] ?? OPTION_STYLE[0];
              const isSelected = selection === option.index;

              return (
                <button
                  key={option.index}
                  type="button"
                  className={`${styles.option} ${styles[`tone_${style.tone}`]} ${isSelected ? styles.optionSelected : ''}`}
                  onClick={() => handlePick(option.index)}
                  disabled={isPaused}
                  aria-pressed={isSelected}
                >
                  <span className={styles.optionIcon} aria-hidden="true">
                    {style.icon}
                  </span>
                  <span className={styles.optionText}>{option.artist}</span>
                </button>
              );
            })}
          </div>
        ) : room.phase === 'reveal' && lastReveal ? (
          <motion.div
            className={styles.revealCard}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32 }}
          >
            <span className={styles.revealBadge}>{lastReveal.song.year}</span>
            <span className={styles.revealLabel}>המבצע/ת המקורי/ת</span>
            <h2 className={styles.revealArtist}>{lastReveal.song.originalArtist}</h2>

            {ownReveal ? (
              <div className={`${styles.outcome} ${ownReveal.correct ? styles.outcomeCorrect : styles.outcomeWrong}`}>
                {ownReveal.selectedIndex === null
                  ? 'לא הספקת/ם לענות'
                  : ownReveal.correct
                    ? `כל הכבוד! +${ownReveal.points.toLocaleString('he-IL')} נקודות`
                    : 'לא הפעם'}
              </div>
            ) : null}
          </motion.div>
        ) : (
          <div className={styles.banner}>
            {room.phase === 'countdown' ? '🎵 מתחילים תכף' : isPaused ? '⏸ המשחק מושהה' : '⏳ רגע לפני השיר הבא'}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <AnimatePresence mode="wait">
          {selection !== null && isQuestion ? (
            <motion.div
              key="marked"
              className={`${styles.status} ${styles.statusOk}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              ✓ נקלט — אפשר לשנות עד שהזמן נגמר
            </motion.div>
          ) : isQuestion ? (
            <motion.div
              key="unmarked"
              className={styles.status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              בחרו את הביצוע המקורי
            </motion.div>
          ) : null}
        </AnimatePresence>
      </footer>
    </main>
  );
}
