import { Badge } from './ui/Badge';

/**
 * Shows whether a score used AI adjustment or the standard location model.
 */
export function MethodBadge({ method, fallback }) {
  if (fallback) {
    return (
      <Badge variant="warning" className="gap-1">
        Standard score
      </Badge>
    );
  }

  if (method === 'ml') {
    return (
      <Badge variant="accent" className="gap-1">
        AI-assisted score
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="gap-1">
      Standard score
    </Badge>
  );
}
