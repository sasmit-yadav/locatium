import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, Layers, Layers3, MapPin, Search } from 'lucide-react';
import { filterHaryanaPlaces } from '../data/haryanaPlaces';
import { searchFeatures } from '../services/features';
import { useDashboardStore } from '../stores/useDashboardStore';
import { BASEMAPS } from '../config/basemaps';
import { ENTERPRISE_LAYER_CATEGORIES } from '../config/enterpriseLayers';
import { Modal } from './ui/Modal';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { layout } from '../design-system/tokens';

export function CommandPalette() {
  const open = useDashboardStore((s) => s.isCommandPaletteOpen);
  const setOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const flyTo = useDashboardStore((s) => s.flyTo);
  const setBasemapId = useDashboardStore((s) => s.setBasemapId);
  const toggleLayer = useDashboardStore((s) => s.toggleLayer);
  const setActiveWorkspace = useDashboardStore((s) => s.setActiveWorkspace);

  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      return undefined;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoadingRemote(true);
      try {
        const json = await searchFeatures(q, { limit: 10 });
        if (!cancelled) {
          setRemoteResults(
            (json.features || [])
              .filter((f) => f.center)
              .map((f) => ({
                id: `feature-${f.tableId}-${f.id}`,
                label: f.name || f.tableId,
                type: 'place',
                subtitle: f.subtitle || `${f.tableId} · ${f.layerId}`,
                action: () =>
                  flyTo({
                    lng: f.center.lng,
                    lat: f.center.lat,
                    zoom: f.type === 'polygon' ? 12 : 14,
                    name: f.name || f.tableId,
                    type: f.subtitle,
                    feature: f,
                  }),
                icon: MapPin,
              }))
          );
        }
      } catch {
        /* ignore search errors in palette */
      } finally {
        if (!cancelled) setLoadingRemote(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, flyTo]);

  const suggestions = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items = [];

    const commands = [
      { id: 'ws-explore', label: 'Switch to Explore', type: 'command', icon: Command, action: () => setActiveWorkspace('explore') },
      { id: 'ws-analysis', label: 'Switch to Analysis', type: 'command', icon: Command, action: () => setActiveWorkspace('analysis') },
      { id: 'ws-ai', label: 'Switch to AI Insights', type: 'command', icon: Command, action: () => setActiveWorkspace('ai') },
      { id: 'ws-reports', label: 'Switch to Reports', type: 'command', icon: Command, action: () => setActiveWorkspace('reports') },
    ];
    items.push(...commands.filter((c) => !q || c.label.toLowerCase().includes(q)));

    BASEMAPS.forEach((b) => {
      if (!q || `basemap ${b.label}`.toLowerCase().includes(q)) {
        items.push({
          id: `bm-${b.id}`,
          label: `Basemap: ${b.label}`,
          type: 'basemap',
          icon: Layers,
          action: () => setBasemapId(b.id),
        });
      }
    });

    ENTERPRISE_LAYER_CATEGORIES.forEach((l) => {
      if (!q || `layer ${l.name}`.toLowerCase().includes(q) || `toggle ${l.name}`.toLowerCase().includes(q)) {
        items.push({
          id: `layer-${l.id}`,
          label: `Toggle layer: ${l.name}`,
          type: 'layer',
          icon: Layers3,
          action: () => toggleLayer(l.id, true),
        });
      }
    });

    if (q.length >= 2) {
      const local = filterHaryanaPlaces(q).map((item) => ({
        id: `local-${item.label}`,
        label: item.label,
        subtitle: 'Gazetteer',
        type: 'place',
        icon: MapPin,
        action: () =>
          flyTo({
            lng: item.lng,
            lat: item.lat,
            zoom: item.zoom || 12,
            name: item.label,
            type: 'Gazetteer',
          }),
      }));
      items.push(...local);
    }

    items.push(...remoteResults);
    return items.slice(0, q ? 15 : 10);
  }, [query, remoteResults, setActiveWorkspace, setBasemapId, toggleLayer, flyTo]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((s) => (s + 1) % Math.max(suggestions.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((s) => (s - 1 + suggestions.length) % Math.max(suggestions.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[selectedIndex]) {
        suggestions[selectedIndex].action();
        setOpen(false);
      }
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Search">
      <div className="flex items-center gap-ds-3 border-b border-ds-border-subtle pb-ds-3">
        <Search size={layout.iconButtonGlyph} className="text-ds-text-tertiary" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search places, layers, commands…"
          className="min-w-0 flex-1 bg-transparent text-ds-title text-ds-text-primary outline-none placeholder:text-ds-text-tertiary"
          aria-label="Search places, layers, and commands"
        />
        {loadingRemote ? <Skeleton variant="text" className="w-8" /> : null}
        <Badge>Esc</Badge>
      </div>

      <div className="mt-ds-3 max-h-[50vh] space-y-ds-1 overflow-y-auto scrollbar-thin">
        {suggestions.map((item, index) => {
          const Icon = item.icon || Command;
          const active = index === selectedIndex;
          return (
            <Card
              key={item.id}
              interactive
              selected={active}
              padding="sm"
              onClick={() => {
                item.action();
                setOpen(false);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex items-center gap-ds-3">
                <Icon
                  size={layout.iconButtonGlyph}
                  className={active ? 'text-ds-accent' : 'text-ds-text-secondary'}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ds-body-med text-ds-text-primary">{item.label}</div>
                  {item.subtitle ? (
                    <div className="mt-0.5 truncate text-ds-small text-ds-text-secondary">{item.subtitle}</div>
                  ) : null}
                </div>
                <Badge>{item.type}</Badge>
              </div>
            </Card>
          );
        })}
        {suggestions.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try a place name, layer, or workspace command."
          />
        ) : null}
      </div>
    </Modal>
  );
}
