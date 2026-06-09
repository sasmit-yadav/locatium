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
    <header className="relative z-[1800] shrink-0 border-b border-white/5 bg-gradient-to-b from-black via-black/95 to-black/80 px-3 py-2 backdrop-blur-md sm:px-5 sm:py-0">
      <div className="grid grid-cols-1 items-center gap-2 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-base font-black tracking-[-0.04em] text-white sm:text-xl">
              LOC<span className="text-nf-red">A</span>TIUM
            </h1>
          </div>
          <p className="truncate text-[9px] uppercase tracking-[0.22em] text-white/40 sm:text-[10px] sm:tracking-[0.28em]">
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
        <span className="mx-0.5 hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
        <button
          type="button"
          title="About this application"
          aria-expanded={aboutOpen}
          onClick={onToggleAbout}
          className={`rounded-xl border p-2 transition sm:rounded-2xl sm:p-2.5 ${
            aboutOpen
              ? 'border-kp-teal/50 bg-kp-glow text-kp-teal'
              : 'border-white/10 bg-black/45 text-white/65 hover:border-white/25 hover:text-white'
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
          ? 'border-nf-red/90 bg-nf-red/20 text-white shadow-lg shadow-nf-red/15'
          : 'border-white/10 bg-black/50 text-white/75 hover:border-kp-teal/35 hover:bg-black/65 hover:text-white'
      }`}
    >
      <span className={active ? 'text-nf-red' : 'text-kp-teal'}>{icon}</span>
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
        className="fixed inset-0 z-[1750] bg-black/45"
        onClick={onClose}
      />
      <div className="fixed right-3 top-[3.75rem] z-[1850] w-[min(calc(100vw-1.5rem),380px)] rounded-2xl border border-white/10 bg-nf-panel p-4 shadow-dock sm:right-5 sm:top-[4.5rem]">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-kp-teal">About</p>
        <p className="mt-2 text-sm leading-relaxed text-white/88">
          <span className="text-white">LOCATIUM</span> is a web map viewer for exploring official geospatial datasets.
          Mapping uses <span className="text-white">MapLibre GL JS</span> with free basemaps (OpenFreeMap / OpenStreetMap).
          Official Haryana overlays are served as <span className="text-kp-teal">cached tiles</span> from this app&apos;s
          API, backed by HARSAC MapServer data.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-nf-muted">
          Layer visibility, opacity, and basemap selection are controlled from the toolbar. Place search uses a{' '}
          <span className="text-white/70">built-in list of major Haryana towns</span> for fast offline lookup.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-nf-muted">
          Contact your system administrator for operational layer terms, attribution, and service availability.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-nf-red py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-nf-red-hover"
        >
          Close
        </button>
      </div>
    </>
  );
}
