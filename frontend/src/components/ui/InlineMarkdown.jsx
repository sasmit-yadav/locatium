/**
 * Minimal inline-markdown renderer for model-written copy.
 *
 * The copilot naturally writes `**bold**` and `*italic*`; rendering its answer as raw
 * text showed readers literal asterisks. This covers exactly the emphasis the model
 * emits and nothing else — no HTML is parsed and no string is ever injected, so there
 * is no XSS surface. Block structure (bullets, line breaks) is preserved by the
 * caller's `whitespace-pre-wrap`.
 */

// Ordered so the two-star form is matched before the one-star form.
const TOKEN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

function renderSegment(segment, key) {
  if (segment.length > 4 && (segment.startsWith('**') || segment.startsWith('__'))) {
    return (
      <strong key={key} className="font-semibold">
        {segment.slice(2, -2)}
      </strong>
    );
  }
  if (segment.length > 2 && (segment.startsWith('*') || segment.startsWith('_'))) {
    return <em key={key}>{segment.slice(1, -1)}</em>;
  }
  return segment;
}

export function InlineMarkdown({ text }) {
  if (typeof text !== 'string' || !text) return null;
  return text.split(TOKEN).filter(Boolean).map(renderSegment);
}
