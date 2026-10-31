import { useEffect, useMemo, useRef, useState } from 'react';
import { filterHaryanaPlaces } from '../data/haryanaPlaces';
import { SearchInput } from './ui/SearchInput';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

const MIN_CHARS = 2;

export function PlaceSearch({ onSelectPlace, className = '' }) {
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const qTrim = query.trim();
  const results = useMemo(() => {
    if (qTrim.length < MIN_CHARS) return [];
    return filterHaryanaPlaces(qTrim).map((p) => ({
      ...p,
      label: p.label,
      type: p.type,
    }));
  }, [qTrim]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!wrapRef.current?.contains(e.target)) {
        /* SearchInput handles its own blur close */
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function choose(place) {
    onSelectPlace?.({
      lng: place.lng,
      lat: place.lat,
      zoom: place.zoom ?? 11,
      label: place.label,
    });
    setQuery(place.label.split(',').slice(0, 1).join(',').trim() || place.label);
  }

  return (
    <div ref={wrapRef} className={`relative min-w-0 w-full ${className}`}>
      <SearchInput
        placeholder="Search Haryana city…"
        value={query}
        onChange={setQuery}
        results={results}
        emptyMessage="No matches — try a different place name"
        renderResult={(item) => (
          <Card
            interactive
            padding="sm"
            className="border-0 shadow-none"
            onClick={() => choose(item)}
          >
            <div className="flex items-start justify-between gap-ds-2">
              <span className="line-clamp-2 text-ds-body text-ds-text-primary">{item.label}</span>
              {item.type ? <Badge>{item.type}</Badge> : null}
            </div>
          </Card>
        )}
      />
    </div>
  );
}
