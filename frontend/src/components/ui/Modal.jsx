import { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { usePrefersReducedMotion } from '../../design-system/usePrefersReducedMotion';

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Centered dialog with overlay. Closes on backdrop click or Escape.
 */
export function Modal({ title, onClose, size = 'md', footer, children, open = true }) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-ds-modal flex items-center justify-center p-ds-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ds-surface-overlay"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative z-10 flex w-full flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-raised shadow-ds-md',
          SIZE[size] || SIZE.md,
          reducedMotion ? '' : 'animate-ds-modal-in',
        ].join(' ')}
      >
        <header className="flex items-center gap-ds-2 border-b border-ds-border-subtle px-ds-4 py-ds-3">
          <h2 className="min-w-0 flex-1 truncate text-ds-title text-ds-text-primary">{title}</h2>
          <IconButton icon={X} onClick={onClose} tooltip="Close" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-ds-4 text-ds-body text-ds-text-primary">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-ds-2 border-t border-ds-border-subtle px-ds-4 py-ds-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
