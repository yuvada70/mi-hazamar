/**
 * יצירת משחק חדש.
 *
 * ברירת המחדל מכוונת ל"התחל ולך": 10 סיבובים, 15 שניות לכל שיר —
 * וההגדרות הבסיסיות בלבד גלויות, כדי שמנהל שרוצה פשוט להתחיל לא
 * ייתקל בטופס ארוך. אם בדרגת הקושי הנבחרת יש פחות שירים ממספר
 * הסיבובים שנבחר, השרת מצמצם אוטומטית והממשק מציג על כך הודעה.
 */

import { useState } from 'react';
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  HEBREW_CLASSICS_PACK,
  ROUND_COUNT_OPTIONS,
  SETTINGS_LIMITS,
  selectSongPool,
  type Difficulty,
  type GameSettings,
} from '@mihazamar/shared';

import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import { paths, useRouter } from '../../router';
import styles from './HostSetup.module.css';

/** גודל מאגר השירים לפי דרגת קושי, לתצוגה ולחישוב ברירות מחדל. */
const poolSizeFor = (difficulty: Difficulty): number => selectSongPool(HEBREW_CLASSICS_PACK, difficulty).length;

export function HostSetup(): JSX.Element {
  const createGame = useGameStore((store) => store.createGame);
  const { navigate } = useRouter();

  const [settings, setSettings] = useState<GameSettings>(() => ({
    ...DEFAULT_SETTINGS,
    roundCount: Math.min(DEFAULT_SETTINGS.roundCount, poolSizeFor(DEFAULT_SETTINGS.difficulty)),
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const totalSongs = poolSizeFor(settings.difficulty);

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  /** החלפת דרגת קושי אינה משנה את מספר הסיבובים הנבחר — השרת מצמצם אותו אוטומטית אם צריך. */
  const updateDifficulty = (difficulty: Difficulty) => update('difficulty', difficulty);

  const handleCreate = async () => {
    setCreating(true);
    await createGame(settings);
    setCreating(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(paths.landing())}>
          ← חזרה
        </button>
        <h1 className={styles.title}>משחק חדש</h1>
        <p className={styles.subtitle}>הגדירו את המשחק, ואז שתפו את הקוד עם המשתתפים.</p>
      </header>

      <Card className={styles.card}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>דרגת קושי</h2>
          <div className={styles.difficulties}>
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty}
                className={`${styles.difficultyChip} ${settings.difficulty === difficulty ? styles.difficultyChipActive : ''}`}
                onClick={() => updateDifficulty(difficulty)}
                aria-pressed={settings.difficulty === difficulty}
              >
                <span className={styles.difficultyLabel}>{DIFFICULTY_LABELS[difficulty]}</span>
                <span className={styles.difficultyDescription}>{DIFFICULTY_DESCRIPTIONS[difficulty]}</span>
                <span className={styles.difficultyCount}>{poolSizeFor(difficulty)} שירים</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>מספר שאלות</h2>
          <div className={styles.roundCounts}>
            {ROUND_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                className={`${styles.roundCountChip} ${settings.roundCount === count ? styles.roundCountChipActive : ''}`}
                onClick={() => update('roundCount', count)}
                aria-pressed={settings.roundCount === count}
              >
                {count}
              </button>
            ))}
          </div>
          {totalSongs < settings.roundCount ? (
            <p className={styles.roundCountWarning}>
              יש רק {totalSongs} שירים בדרגת הקושי הנבחרת — המשחק ישחק {totalSongs} סיבובים בלבד.
            </p>
          ) : (
            <p className={styles.sliderHint}>מתוך {totalSongs} שירים זמינים בדרגת הקושי הנבחרת</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sliderHead}>
            <h2 className={styles.sectionTitle}>זמן לכל שאלה</h2>
            <span className={`${styles.sliderValue} tabular`}>{settings.roundDurationMs / 1_000} שנ׳</span>
          </div>
          <input
            type="range"
            className={styles.slider}
            min={SETTINGS_LIMITS.roundDurationMs.min}
            max={SETTINGS_LIMITS.roundDurationMs.max}
            step={1_000}
            value={settings.roundDurationMs}
            onChange={(event) => update('roundDurationMs', Number(event.target.value))}
          />
        </section>

        <button
          className={styles.advancedToggle}
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? '▾' : '◂'} הגדרות מתקדמות
        </button>

        {advancedOpen ? (
          <section className={styles.advanced}>
            <Toggle
              label="ערבוב סדר השירים"
              description="כל משחק בסדר אחר — מונע יתרון למי שכבר שיחק"
              checked={settings.shuffleQuestions}
              onChange={(value) => update('shuffleQuestions', value)}
            />
            <Toggle
              label="הצגת מיקום בדירוג לשחקנים"
              description="השחקן רואה את מקומו היחסי במהלך המשחק"
              checked={settings.showLiveRank}
              onChange={(value) => update('showLiveRank', value)}
            />
          </section>
        ) : null}
      </Card>

      <Button size="lg" block loading={creating} onClick={handleCreate} icon="🚀">
        יצירת משחק
      </Button>
    </div>
  );
}

/** מתג הפעלה/כיבוי עם תיאור. */
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.toggleTrack} aria-hidden="true">
        <span className={styles.toggleThumb} />
      </span>
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDescription}>{description}</span>
      </span>
    </label>
  );
}
