/**
 * מסך התוצאות של המנהל — הסיום המבוים של המשחק.
 *
 * הסיכום בנוי כמופע בשלושה מערכות:
 *   1. סקירת הסיבובים — השיר, המבצע האמיתי וכל התשובות.
 *   2. טבלת הדירוג המלאה.
 *   3. פודיום עם קונפטי.
 *
 * המנהל שולט בקצב (הבא / הקודם / דילוג לסיכום), כי צריך לפעמים
 * להאיץ ולפעמים לעצור ולדבר.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Confetti } from '../../components/ui/Confetti';
import { Leaderboard } from '../../components/results/Leaderboard';
import { Podium } from '../../components/results/Podium';
import { RoundReview } from '../../components/results/RoundReview';
import { Button } from '../../components/ui/Button';
import { Stat } from '../../components/ui/misc';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../state/gameStore';
import { paths, useRouter } from '../../router';
import styles from './HostResults.module.css';

/** שלבי המופע. */
type Act = { readonly kind: 'round'; readonly index: number } | { readonly kind: 'leaderboard' } | { readonly kind: 'podium' };

/** משך ההצגה האוטומטית של כל סיבוב. */
const AUTO_ADVANCE_MS = 8_000;

export function HostResults(): JSX.Element {
  const results = useGameStore((store) => store.results);
  const room = useGameStore((store) => store.room);
  const restartGame = useGameStore((store) => store.restartGame);
  const endHostSession = useGameStore((store) => store.endHostSession);
  const playSound = useSound();
  const { navigate } = useRouter();

  const [act, setAct] = useState<Act>({ kind: 'round', index: 0 });
  const [autoPlay, setAutoPlay] = useState(true);

  /** רצף כל המערכות, לניווט קדימה ואחורה. */
  const acts = useMemo<Act[]>(() => {
    if (!results) return [{ kind: 'podium' }];
    return [
      ...results.rounds.map((_, index) => ({ kind: 'round', index } as const)),
      { kind: 'leaderboard' } as const,
      { kind: 'podium' } as const,
    ];
  }, [results]);

  const currentIndex = useMemo(
    () =>
      acts.findIndex((candidate) =>
        candidate.kind === 'round' && act.kind === 'round'
          ? candidate.index === act.index
          : candidate.kind === act.kind,
      ),
    [act, acts],
  );

  const goTo = useCallback(
    (index: number) => {
      const next = acts[Math.min(acts.length - 1, Math.max(0, index))];
      if (next) setAct(next);
    },
    [acts],
  );

  /* התקדמות אוטומטית בין הסיבובים. */
  useEffect(() => {
    if (!autoPlay || act.kind !== 'round') return;

    const timer = window.setTimeout(() => goTo(currentIndex + 1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [act, autoPlay, currentIndex, goTo]);

  /* צלילים בהתאם למערכה. */
  useEffect(() => {
    if (act.kind === 'round') playSound('reveal');
    if (act.kind === 'podium') playSound('fanfare');
  }, [act, playSound]);

  /* ניווט במקלדת — נוח כשמנווטים עם שלט מצגות. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'PageDown' || event.key === ' ') {
        setAutoPlay(false);
        goTo(currentIndex + 1);
      } else if (event.key === 'ArrowRight' || event.key === 'PageUp') {
        setAutoPlay(false);
        goTo(currentIndex - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, goTo]);

  if (!results) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>מחשבים תוצאות…</p>
      </div>
    );
  }

  const players = room?.players ?? results.leaderboard.map((entry) => entry.player);
  const winner = results.leaderboard[0];
  const totalCorrect = results.leaderboard.reduce((sum, entry) => sum + entry.correctAnswers, 0);

  return (
    <div className={styles.page}>
      <Confetti active={act.kind === 'podium'} />

      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>
            {act.kind === 'round' ? 'סיכום המשחק' : act.kind === 'leaderboard' ? 'טבלת דירוג' : 'הזוכים'}
          </h1>
          {results.endedEarly ? <span className={styles.earlyTag}>המשחק הופסק מוקדם</span> : null}
        </div>

        <nav className={styles.nav} aria-label="ניווט בין שלבי הסיכום">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentIndex <= 0}
            onClick={() => {
              setAutoPlay(false);
              goTo(currentIndex - 1);
            }}
          >
            → הקודם
          </Button>

          <div className={styles.dots} aria-hidden="true">
            {acts.map((candidate, index) => (
              <span
                key={`${candidate.kind}-${index}`}
                className={`${styles.dot} ${index === currentIndex ? styles.dotActive : ''} ${
                  index > currentIndex ? styles.dotUpcoming : ''
                }`}
              />
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={currentIndex >= acts.length - 1}
            onClick={() => {
              setAutoPlay(false);
              goTo(currentIndex + 1);
            }}
          >
            הבא ←
          </Button>

          {act.kind === 'round' ? (
            <Button variant="ghost" size="sm" onClick={() => goTo(acts.length - 1)}>
              דילוג לפודיום ⏭
            </Button>
          ) : null}
        </nav>
      </header>

      <main className={styles.stage}>
        <AnimatePresence mode="wait">
          {act.kind === 'round' ? (
            <motion.div
              key={`round-${act.index}`}
              className={styles.actPane}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <RoundReview round={results.rounds[act.index]!} players={players} />
            </motion.div>
          ) : null}

          {act.kind === 'leaderboard' ? (
            <motion.div
              key="leaderboard"
              className={`${styles.actPane} ${styles.leaderboardPane}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32 }}
            >
              <div className={styles.summaryStats}>
                <Stat label="משתתפים" value={results.leaderboard.length} />
                <Stat label="שירים" value={results.rounds.length} />
                <Stat label="תשובות נכונות (סה״כ)" value={totalCorrect} tone="primary" />
                <Stat label="ניקוד מוביל" value={(winner?.totalPoints ?? 0).toLocaleString('he-IL')} tone="accent" />
              </div>
              <Leaderboard entries={results.leaderboard} />
            </motion.div>
          ) : null}

          {act.kind === 'podium' ? (
            <motion.div
              key="podium"
              className={`${styles.actPane} ${styles.podiumPane}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.p
                className={styles.winnerLine}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.7 }}
              >
                🎉 {winner ? `${winner.player.name} מכיר/ה הכי טוב את הזמר העברי!` : 'כל הכבוד לכולם!'}
              </motion.p>
              <Podium entries={results.leaderboard.slice(0, 3)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <footer className={styles.footer}>
        <Button variant="ghost" size="lg" onClick={() => { endHostSession(); navigate(paths.landing()); }}>
          סיום
        </Button>

        <Button size="lg" icon="🔄" onClick={() => void restartGame()}>
          משחק חדש עם אותם שחקנים
        </Button>
      </footer>
    </div>
  );
}
