import { IconGlobe, IconInfo, IconLayers, IconSearch } from './UiIcons';

export function AppChrome({
  onToggleAbout,
  aboutOpen,
  onLayers,
  onBasemap,
  onFacilityFinder,
  facilityFinderLit,
  layersLit,
  basemapLit,
  searchSlot,
}) {
  return (
    <header className="relative z-[1800] shrink-0 border-b border-ds-border-subtle bg-gradient-to-b from-ds-surface-raised via-ds-surface-raised to-ds-surface-raised px-3 py-2 backdrop-blur-md sm:px-5 sm:py-0">
      <div className="grid grid-cols-1 items-center gap-2 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-base font-black tracking-[-0.04em] text-ds-text-primary sm:text-xl">
              LOC<span className="text-ds-accent">A</span>TIUM
            </h1>
          </div>
          <p className="truncate text-[9px] uppercase tracking-[0.22em] text-ds-text-tertiary sm:text-[10px] sm:tracking-[0.28em]">
            Official reference data · map viewer
          </p>
        </div>

        {searchSlot ? <div className="min-w-0 sm:max-w-xl sm:justify-self-stretch">{searchSlot}</div> : null}

      <nav className="flex shrink-0 items-center justify-end gap-1.5 sm:justify-self-end sm:gap-2" aria-label="Map menus">
        <HeaderToggle
          label="Layers"
          title="Layer list — official data"
          active={layersLit}
          onClick={onLayers}
          icon={<IconLayers className="h-[18px] w-[18px] sm:h-5 sm:w-5" />}
        />
        <HeaderToggle
          label="Basemap"
          title="Basemap selection"
          active={basemapLit}
          onClick={onBasemap}
          icon={<IconGlobe className="h-[18px] w-[18px] sm:h-5 sm:w-5" />}
        />
        {onFacilityFinder ? (
          <HeaderToggle
            label="Find Facility"
            title="Find nearest facility"
            active={facilityFinderLit}
            onClick={onFacilityFinder}
            icon={<IconSearch className="h-[18px] w-[18px] sm:h-5 sm:w-5" />}
          />
        ) : null}
        <span className="mx-0.5 hidden h-6 w-px bg-ds-border sm:block" aria-hidden />
        <button
          type="button"
          title="About this application"
          aria-expanded={aboutOpen}
          onClick={onToggleAbout}
          className={`rounded-xl border p-2 transition sm:rounded-2xl sm:p-2.5 ${
            aboutOpen
              ? 'border-ds-accent bg-ds-accent-subtle text-ds-accent-text'
              : 'border-ds-border bg-ds-surface-sunken text-ds-text-secondary hover:border-ds-border hover:text-ds-text-primary'
          }`}
        >
          <IconInfo className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
        </button>
      </nav>
      </div>
    </header>
  );
}

function HeaderToggle({ label, title, active, onClick, icon }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs ${
        active
          ? 'border-ds-accent bg-ds-accent-subtle text-ds-text-primary shadow-lg shadow-ds-sm'
          : 'border-ds-border bg-ds-surface-overlay text-ds-text-secondary hover:border-ds-accent hover:bg-ds-surface-sunken hover:text-ds-text-primary'
      }`}
    >
      <span className={active ? 'text-ds-accent' : 'text-ds-accent-text'}>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function AboutPopover({ open, onClose }) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close about"
        className="fixed inset-0 z-[1750] bg-ds-surface-overlay"
        onClick={onClose}
      />
      <div className="fixed right-3 top-[3.75rem] z-[1850] w-[min(calc(100vw-1.5rem),380px)] rounded-2xl border border-ds-border bg-ds-surface-raised p-4 shadow-ds-sm sm:right-5 sm:top-[4.5rem]">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ds-accent-text">About</p>
        <p className="mt-2 text-sm leading-relaxed text-ds-text-primary">
          <span className="text-ds-text-primary">LOCATIUM</span> is a web map viewer for exploring official geospatial datasets.
          Mapping uses <span className="text-ds-text-primary">MapLibre GL JS</span> with free basemaps (OpenFreeMap / OpenStreetMap).
          Official Haryana overlays are served as <span className="text-ds-accent-text">cached tiles</span> from this app&apos;s
          API, backed by HARSAC MapServer data.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ds-text-secondary">
          Layer visibility, opacity, and basemap selection are controlled from the toolbar. Place search uses a{' '}
          <span className="text-ds-text-secondary">built-in list of major Haryana towns</span> for fast offline lookup.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ds-text-secondary">
          Contact your system administrator for operational layer terms, attribution, and service availability.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-ds-accent py-2.5 text-xs font-bold uppercase tracking-wide text-ds-text-primary transition hover:bg-ds-accent-hover"
        >
          Close
        </button>
      </div>
    </>
  );
}
