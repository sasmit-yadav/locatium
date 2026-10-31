import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'locatium.copilot.layout.v1';
const MIN_W = 340;
const MIN_H = 360;
const DEFAULT_W = 420;
const DEFAULT_H = 600;
const EDGE = 16;
/** Room for the map's own vertical control strips on the right edge. */
const CONTROLS_GUTTER = 64;

function readSaved() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function save(layout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* storage unavailable: layout simply isn't remembered */
  }
}

/** The visible map area, so the panel never sits on the side panels. */
function mapRect() {
  const el = document.querySelector('.maplibregl-map');
  const r = el?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return r;
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/**
 * Position + size for a floating, draggable, resizable panel.
 * - Docked (default): bottom-right of the map area, left of the map controls.
 * - Dragging the handle undocks it; the spot and size are remembered per browser.
 * - Narrow screens get a full-width bottom sheet.
 */
export function useFloatingPanel({ open, deps = [] }) {
  const [size, setSize] = useState(() => {
    const saved = readSaved();
    return { w: saved?.w || DEFAULT_W, h: saved?.h || DEFAULT_H };
  });
  const [free, setFree] = useState(() => {
    const saved = readSaved();
    return saved?.free ? { x: saved.x, y: saved.y } : null;
  });
  const [frame, setFrame] = useState(() => mapRect());
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [dragging, setDragging] = useState(false);


  const remeasure = useCallback(() => {
    setFrame(mapRect());
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, []);

  useLayoutEffect(() => {
    // Next frame: side panels have finished laying out by then.
    const id = requestAnimationFrame(remeasure);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps]);

  useEffect(() => {
    window.addEventListener('resize', remeasure);
    const el = document.querySelector('.maplibregl-map');
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    if (ro && el) ro.observe(el);
    return () => {
      window.removeEventListener('resize', remeasure);
      ro?.disconnect();
    };
  }, [remeasure, open]);

  const compact = viewport.w < 640;

  // Docked, the panel fits the map area (left of the map controls) so it never covers side panels.
  const dockedMaxW = (frame.width || viewport.w) - CONTROLS_GUTTER - EDGE;
  const w = clamp(size.w, MIN_W, free ? viewport.w - EDGE * 2 : Math.min(viewport.w - EDGE * 2, dockedMaxW));
  const h = clamp(size.h, MIN_H, viewport.h - EDGE * 2 - 56);

  let x;
  let y;
  if (free) {
    x = clamp(free.x, EDGE, viewport.w - w - EDGE);
    y = clamp(free.y, EDGE + 56, viewport.h - h - EDGE);
  } else {
    const right = (frame.right || viewport.w) - CONTROLS_GUTTER;
    const bottom = (frame.bottom || viewport.h) - 36;
    x = clamp(right - w, (frame.left || 0) + EDGE, viewport.w - w - EDGE);
    y = clamp(bottom - h, EDGE + 56, viewport.h - h - EDGE);
  }

  const persist = useCallback((next) => save(next), []);

  /** Pointer-drag on the header moves the panel. */
  const onDragStart = useCallback(
    (e) => {
      if (compact || e.button !== 0) return;
      if (e.target.closest('button, a, input, textarea, select')) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const originX = x;
      const originY = y;
      setDragging(true);
      let latest = { x: originX, y: originY };
      const move = (ev) => {
        latest = { x: originX + ev.clientX - startX, y: originY + ev.clientY - startY };
        setFree(latest);
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        persist({ ...size, free: true, ...latest });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [compact, x, y, size, persist]
  );

  /** Pointer-drag on the top-left grip resizes (the panel grows up and to the left). */
  const onResizeStart = useCallback(
    (e) => {
      if (compact || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { w, h, x, y };
      setDragging(true);
      let latest = { w, h, x, y };
      const move = (ev) => {
        const dw = startX - ev.clientX;
        const dh = startY - ev.clientY;
        const nw = clamp(start.w + dw, MIN_W, viewport.w - EDGE * 2);
        const nh = clamp(start.h + dh, MIN_H, viewport.h - EDGE * 2 - 56);
        latest = { w: nw, h: nh, x: start.x + start.w - nw, y: start.y + start.h - nh };
        setSize({ w: nw, h: nh });
        setFree({ x: latest.x, y: latest.y });
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        persist({ w: latest.w, h: latest.h, free: true, x: latest.x, y: latest.y });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [compact, w, h, x, y, viewport, persist]
  );

  /** Snap back to the docked corner and default size. */
  const redock = useCallback(() => {
    setFree(null);
    setSize({ w: DEFAULT_W, h: DEFAULT_H });
    persist({ w: DEFAULT_W, h: DEFAULT_H, free: false });
  }, [persist]);

  const launcher = {
    right: Math.max(EDGE, viewport.w - ((frame.right || viewport.w) - CONTROLS_GUTTER)),
    // Sit above the map's attribution line so the credits stay readable.
    bottom: Math.max(EDGE, viewport.h - ((frame.bottom || viewport.h) - 40)),
  };

  return {
    compact,
    dragging,
    undocked: Boolean(free),
    style: compact ? null : { left: x, top: y, width: w, height: h },
    launcherStyle: compact ? null : { right: launcher.right, bottom: launcher.bottom },
    onDragStart,
    onResizeStart,
    redock,
  };
}
