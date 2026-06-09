import { useEffect, useRef, useState } from 'react';
import { IconSearch } from './UiIcons';
import { filterHaryanaPlaces } from '../data/haryanaPlaces';

const MIN_CHARS = 2;

export function PlaceSearch({ onSelectPlace }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);

  const qTrim = query.trim();
  const queryTooShort = qTrim.length < MIN_CHARS;
  const results = queryTooShort ? [] : filterHaryanaPlaces(qTrim);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function choose(place) {
    onSelectPlace({
      lng: place.lng,
      lat: place.lat,
      zoom: place.zoom ?? 11,
      label: place.label,
    });
    setQuery(place.label.split(',').slice(0, 1).join(',').trim() || place.label);
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }

    const list = queryTooShort ? [] : results;
    if (e.key === 'ArrowDown' && open && list.length > 0) {
      e.preventDefault();
      setHighlight((i) => Math.min(list.length - 1, Math.max(0, i) + 1));
      return;
    }
    if (e.key === 'ArrowUp' && open && list.length > 0) {
      e.preventDefault();
      setHighlight((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
      return;
    }

    if (e.key === 'Enter') {
      if (!open || list.length === 0) return;
      e.preventDefault();
      const idx = highlight >= 0 ? highlight : 0;
      if (list[idx]) choose(list[idx]);
    }
  }

  const showPanel = open && !queryTooShort;
  const effectiveResults = queryTooShort ? [] : results;
  const showEmptyRow =
    !queryTooShort && effectiveResults.length === 0 && qTrim.length >= MIN_CHARS;

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full">
      <label htmlFor="locatium-place-search" className="sr-only">
        Search Haryana cities — type at least two letters
      </label>
      <div className="relative flex items-center">
        <IconSearch className="pointer-events-none absolute left-3 h-4 w-4 text-white/35" aria-hidden />
        <input
          id="locatium-place-search"
          type="search"
          role="combobox"
          aria-expanded={open && showPanel}
          aria-controls="locatium-place-listbox"
          aria-activedescendant={
            highlight >= 0 ? `geo-opt-${effectiveResults[highlight]?.id}-${highlight}` : undefined
          }
          autoComplete="off"
          placeholder="Haryana city…"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            const t = v.trim();
            setQuery(v);
            setOpen(true);
            if (t.length < MIN_CHARS) setHighlight(-1);
            else setHighlight(filterHaryanaPlaces(t).length ? 0 : -1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-white/12 bg-black/50 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none ring-kp-teal/40 transition focus:border-kp-teal/50 focus:ring-1"
        />
      </div>

      {showPanel ? (
        <ul
          id="locatium-place-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[1790] max-h-72 overflow-y-auto rounded-xl border border-white/12 bg-[rgb(18,18,20)] py-1 shadow-dock scrollbar-thin"
        >
          {showEmptyRow ? (
            <li className="px-3 py-2 text-sm text-nf-muted">No matches.</li>
          ) : null}
          {effectiveResults.map((p, idx) => (
            <li
              key={`${p.id}-${idx}`}
              id={`geo-opt-${p.id}-${idx}`}
              role="option"
              aria-selected={highlight === idx}
              title={p.label}
              className={`cursor-pointer px-3 py-2 text-left text-[13px] leading-snug text-white/88 ${
                highlight === idx ? 'bg-white/10' : 'hover:bg-white/8'
              }`}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <span className="line-clamp-2">{p.label}</span>
              {p.type ? (
                <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-white/35">{p.type}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
