import { useEffect, useId, useRef, useState } from 'react';
import { layout } from '../../design-system/tokens';

/**
 * Hover tooltip with 300ms delay — wraps icon-only controls.
 */
export function Tooltip({ content, children, side = 'bottom' }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  function show() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), layout.tooltipDelayMs);
  }

  function hide() {
    clearTimeout(timer.current);
    setVisible(false);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const sideClass =
    side === 'top'
      ? 'bottom-full left-1/2 mb-1 -translate-x-1/2'
      : side === 'left'
        ? 'right-full top-1/2 mr-1 -translate-y-1/2'
        : side === 'right'
          ? 'left-full top-1/2 ml-1 -translate-y-1/2'
          : 'top-full left-1/2 mt-1 -translate-x-1/2';

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && content ? (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-ds-toast whitespace-nowrap rounded-ds-sm border border-ds-border bg-ds-surface-raised px-ds-2 py-ds-1 text-ds-small text-ds-text-primary shadow-ds-sm ${sideClass}`}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
