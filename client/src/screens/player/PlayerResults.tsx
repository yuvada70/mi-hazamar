/**
 * מסך הסיום של השחקן.
 *
 * בניגוד למסך המנהל, כאן הסיפור אישי: איפה סיימתי, כמה צברתי, ואיך
 * ענית בכל שיר לעומת הביצוע האמיתי. הפודיום מוצג גם כאן, כדי שכולם
 * יחגגו יחד גם אם הם מסתכלים בטלפון ולא במסך הגדול.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { medalFor } from '@mihazamar/shared';

import { Confetti } from '../../components/ui/Confetti';
import { Leaderboard } from '../../components/results/Leaderboard';
import { Podium } from '../../components/results/Podium';
import { Button } from '../../components/ui/Button';
import { Stat } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import styles from './PlayerResults.module.css';

/** לשוניות המסך. */
type Tab = 'me' | 'board';

export function PlayerResults(): JSX.Element {
  const results = useGameStore((store) => store.results);
  const playerId = useGameStore((store) => store.playerId);
  const leaveGame = useGameStore((store) => store.leaveGame);

  const [tab, setTab] = useState<Tab>('me');

  const myEntry = useMemo(
    () => results?.leaderboard.find((entry) => entry.player.id === playerId) ?? null,
    [playerId, results],
  );

  const myAnswers = useMemo(() => {
    if (!results || !playerId) return [];
    return results.rounds.map((round) => ({
      round,
      answer: round.answers.find((candidate) => candidate.playerId === playerId) ?? null,
    }));
  }, [playerId, results]);

  if (!results) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>מחשבים תוצאות…</p>
      </main>
    );
  }

  const medal = myEntry ? medalFor(myEntry.rank) : null;
  const isPodium = (myEntry?.rank ?? 99) <= 3;

  return (
    <main className={styles.page}>
      <Confetti active={isPodium} durationMs={3_500} count={90} />

      <motion.header
        className={styles.hero}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <span className={styles.heroMedal} aria-hidden="true">
          {medal ?? '🎯'}
        </span>
        <h1 className={styles.heroTitle}>
          {myEntry ? `מקום ${myEntry.rank} מתוך ${results.leaderboard.length}` : 'המשחק הסתיים'}
        </h1>

        {myEntry ? (
          <div className={styles.heroStats}>
            <Stat label="נקודות" value={myEntry.totalPoints.toLocaleString('he-IL')} tone="primary" />
            <Stat label="תשובות נכונות" value={`${myEntry.correctAnswers}/${myEntry.answeredRounds}`} />
            <Stat label="דירוג" value={`#${myEntry.rank}`} tone="accent" />
          </div>
        ) : null}
      </motion.header>

      <div className={styles.tabs} role="tablist">
        <button
          className={`${styles.tab} ${tab === 'me' ? styles.tabActive : ''}`}
          onClick={() => setTab('me')}
          role="tab"
          aria-selected={tab === 'me'}
        >
          איך ענית
        </button>
        <button
          className={`${styles.tab} ${tab === 'board' ? styles.tabActive : ''}`}
          onClick={() => setTab('board')}
          role="tab"
          aria-selected={tab === 'board'}
        >
          דירוג ופודיום
        </button>
      </div>

      {tab === 'me' ? (
        <section className={styles.panel}>
          <ul className={styles.roundsList}>
            {myAnswers.map(({ round, answer }) => {
              const correctArtist = round.options[round.correctIndex]?.artist ?? round.song.originalArtist;
              const myArtist = answer?.selectedIndex !== null && answer?.selectedIndex !== undefined
                ? round.options[answer.selectedIndex]?.artist ?? null
                : null;

              return (
                <li
                  key={round.index}
                  className={`${styles.roundRow} ${
                    answer?.correct ? styles.roundRowCorrect : myArtist ? styles.roundRowWrong : styles.roundRowMissing
                  }`}
                >
                  <div className={styles.roundInfo}>
                    <span className={styles.roundIndex}>{round.index + 1}</span>
                    <div className={styles.roundText}>
                      <span className={styles.roundSong}>{round.song.title}</span>
                      <span className={styles.roundArtist}>
                        {myArtist
                          ? answer?.correct
                            ? `ענית נכון: ${correctArtist}`
                            : `ענית: ${myArtist} · הנכון: ${correctArtist}`
                          : `לא ענית · הנכון: ${correctArtist}`}
                      </span>
                    </div>
                  </div>
                  <span className={`${styles.roundPoints} tabular`}>
                    {answer && answer.points > 0 ? `+${answer.points.toLocaleString('he-IL')}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className={styles.panel}>
          <Podium entries={results.leaderboard.slice(0, 3)} highlightPlayerId={playerId} />
          <Leaderboard entries={results.leaderboard} highlightPlayerId={playerId} />
        </section>
      )}

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={() => void leaveGame()}>
          יציאה
        </Button>
      </footer>

      <p className={styles.waitNote}>אם המנהל יתחיל משחק חדש — תצורפו אליו אוטומטית.</p>
    </main>
  );
}
