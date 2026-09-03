/**
 * סקירת סיבוב בודד במסך הסיכום.
 *
 * מציגה את השיר והביצוע המקורי שנחשף, ולאחר מכן את כל התשובות —
 * תשובות נכונות למעלה, ואז שגויות, ממוינות לפי מהירות. כך רואים
 * מיד מי ידע ומי ניחש.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { PlayerPublic, RoundResult } from '@mihazamar/shared';

import { AvatarBadge } from '../ui/misc';
import styles from './RoundReview.module.css';

export interface RoundReviewProps {
  readonly round: RoundResult;
  /** כל השחקנים, לצורך שמות ואווטארים. */
  readonly players: readonly PlayerPublic[];
  readonly highlightPlayerId?: string | null;
  /** האם להריץ אנימציית הופעה מדורגת. */
  readonly animate?: boolean;
}

export function RoundReview({
  round,
  players,
  highlightPlayerId = null,
  animate = true,
}: RoundReviewProps): JSX.Element {
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const correctArtist = round.options[round.correctIndex]?.artist ?? round.song.originalArtist;

  /** תשובות ממוינות: נכונות קודם (מהמהיר לאיטי), ואז שגויות ולא נענו. */
  const sortedAnswers = useMemo(() => {
    return [...round.answers].sort((a, b) => {
      if (a.correct !== b.correct) return a.correct ? -1 : 1;
      if (a.selectedIndex === null && b.selectedIndex === null) return 0;
      if (a.selectedIndex === null) return 1;
      if (b.selectedIndex === null) return -1;
      return (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity);
    });
  }, [round.answers]);

  const correctCount = round.answers.filter((answer) => answer.correct).length;
  const missing = round.answers.filter((answer) => answer.selectedIndex === null).length;

  return (
    <div className={styles.review}>
      <motion.div
        className={styles.header}
        initial={animate ? { opacity: 0, y: -12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className={styles.roundBadge}>סיבוב {round.index + 1}</span>
        <h2 className={styles.songTitle}>{round.song.title}</h2>
        <p className={styles.songMeta}>{round.song.year}</p>
        <div className={styles.reveal}>
          <span className={styles.revealLabel}>המבצע/ת המקורי/ת</span>
          <span className={styles.revealArtist}>{correctArtist}</span>
        </div>
        {round.song.note ? <p className={styles.note}>{round.song.note}</p> : null}
      </motion.div>

      <div className={styles.summary}>
        <span className={styles.summaryItem}>
          <b className={styles.summaryValue}>{correctCount}</b> ענו נכון
        </span>
        {missing > 0 ? (
          <span className={styles.summaryItem}>
            <b className={styles.summaryValue}>{missing}</b> לא הספיקו
          </span>
        ) : null}
      </div>

      <ul className={styles.rows}>
        {sortedAnswers.map((answer, index) => {
          const player = playersById.get(answer.playerId);
          const selectedArtist =
            answer.selectedIndex !== null ? round.options[answer.selectedIndex]?.artist ?? null : null;

          return (
            <motion.li
              key={answer.playerId}
              className={[
                styles.row,
                answer.correct ? styles.rowCorrect : answer.selectedIndex !== null ? styles.rowWrong : styles.rowMissing,
                answer.playerId === highlightPlayerId ? styles.rowMe : null,
              ]
                .filter(Boolean)
                .join(' ')}
              initial={animate ? { opacity: 0, x: -16 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: animate ? 0.15 + index * 0.04 : 0, duration: 0.3 }}
            >
              {player ? <AvatarBadge avatar={player.avatar} size={28} /> : null}
              <span className={styles.rowName}>{player?.name ?? 'שחקן'}</span>
              <span className={styles.rowAnswer}>{selectedArtist ?? 'לא ענה/תה'}</span>
              <span className={`${styles.rowPoints} tabular`}>
                {answer.points > 0 ? `+${answer.points.toLocaleString('he-IL')}` : '—'}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
