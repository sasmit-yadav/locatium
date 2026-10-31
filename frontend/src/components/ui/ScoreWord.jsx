import { scoreWordKey, useT } from '../../i18n';

const TONE = {
  good: 'bg-ds-success-subtle text-ds-success',
  average: 'bg-ds-warning-subtle text-ds-warning',
  weak: 'bg-ds-danger-subtle text-ds-danger',
};

/** "Good / Average / Weak" pill for a 0–100 score, so nobody has to interpret "64". */
export function ScoreWord({ score, className = '' }) {
  const t = useT();
  const key = scoreWordKey(score);
  if (!key) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[key]} ${className}`}>
      {t(`score.${key}`)}
    </span>
  );
}
