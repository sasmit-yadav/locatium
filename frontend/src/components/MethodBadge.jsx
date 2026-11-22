import { Badge } from './ui/Badge';

const EXPERIMENTAL_NOTE =
  'Experimental model output, shown for transparency only. It is trained on 30 synthetic labels and is not used in the score.';

/** The experimental ML number is hidden from the public unless VITE_SHOW_EXPERIMENTAL_ML=true. */
const SHOW_EXPERIMENTAL_ML = import.meta.env.VITE_SHOW_EXPERIMENTAL_ML === 'true';

/**
 * Shows how a score was produced. The formula score is authoritative; an ML estimate,
 * when present and not applied, is displayed separately and labelled experimental.
 */
export function MethodBadge({ method, fallback, experimentalScore = null }) {
  const primary =
    method === 'ml' && !fallback ? (
      <Badge variant="accent" className="gap-1">
        AI-assisted score
      </Badge>
    ) : (
      <Badge variant="success" className="gap-1">
        Formula score
      </Badge>
    );

  if (!SHOW_EXPERIMENTAL_ML || experimentalScore == null || method === 'ml') return primary;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {primary}
      <span title={EXPERIMENTAL_NOTE}>
        <Badge variant="default" className="gap-1">
          Experimental ML {Math.round(experimentalScore)}
        </Badge>
      </span>
    </span>
  );
}
