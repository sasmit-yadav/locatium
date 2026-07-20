# LOCATIUM UI Migration Prompt — "Felt / Mapbox Studio" Design System
### Ultra-detailed version, built for extensibility across current + future services

Paste this whole document into Claude Code (or any coding agent working in this repo). It assumes the real stack: **React 19 + Vite + Tailwind CSS + MapLibre GL JS**, components under `frontend/src/components/`, config under `frontend/src/config/`.

This version has two goals, not one:

1. **Restyle** the existing UI (map, layers panel, identify panel, facility finder, zone panel, toolbar, search) into a Felt/Mapbox-inspired subtle, professional look.
2. **Build a small internal design system** (tokens + reusable primitives) so that every *future* service on the roadmap — Investor Dashboard, Admin Dashboard, Public Dashboard, PDF/report UI, Analysis scoring views, Parliamentary/Electoral switch, Facility Filter Panel, saved searches, comparison views — **automatically inherits this visual language** instead of each feature reinventing its own panel style, spacing, and color logic.

If the agent only does step 1 and skips step 2, the redesign will look right today and drift back into inconsistency the moment the next roadmap feature (Week 5–12 items) gets built. **Step 2 is not optional.**

---

## 0. Ground rules for the agent

```
This is a presentation-layer migration only. Do not change:
- API endpoints or request/response shapes
- MapLibre source/layer *data* config (IDs, source URLs, filters)
- Routing, state management logic, or data-fetching hooks
- Business logic in services/ or controllers/ (backend untouched entirely)

You MAY change:
- MapLibre *paint*/*layout* properties that are purely visual
  (opacity, color, line-width) — not the layers/sources themselves
- All Tailwind classes, component JSX structure, and CSS
- tailwind.config.js (extend, don't replace, unless asked)
- Add new shared/reusable components under a new
  frontend/src/components/ui/ directory

Work in the phased order in Section 6. After each phase, stop and
summarize exactly what changed (files touched, before/after screenshots
if possible) before moving to the next phase.
```

---

## 1. Design philosophy (why, not just what)

State this to the agent as the guiding principle, since every future decision should be checked against it:

> The map is the product. The interface is a set of quiet instruments around it — like the cockpit of a well-designed camera, not a spaceship. Every panel, button, and color exists to help the person read the map faster, never to announce that the software is sophisticated. When in doubt, remove an element rather than add one. Felt and Mapbox Studio both win on the same axiom: **restraint is the feature.**

Two litmus tests for any new UI element added later (by this migration or by future features):
1. **Does it compete with the map for attention, or does it recede when not needed?** Recede = collapse to icon, low contrast until hovered/focused, no persistent motion.
2. **Does it reuse an existing primitive from the design system (Section 3), or is it a one-off?** One-offs are the failure mode this whole document exists to prevent.

---

## 2. Design tokens — exact values, not adjectives

Instruct the agent to create `frontend/src/design-system/tokens.js` (or `tokens.css` as CSS custom properties, whichever fits the existing Tailwind setup better) as the **single source of truth**. Every component — current and future — pulls from this file. Extend `tailwind.config.js` `theme.extend` to reference these instead of hardcoding hex values inline anywhere.

### 2.1 Color

```js
// tokens.js
export const colors = {
  // Surfaces
  surface: {
    base: '#FFFFFF',      // app background behind the map canvas edges
    raised: '#FFFFFF',    // cards, panels, modals
    sunken: '#F5F6F7',    // input backgrounds, inset rows, table stripes
    overlay: 'rgba(20, 22, 26, 0.4)', // modal backdrop
  },
  border: {
    default: '#E5E7EA',
    subtle: '#EEF0F2',
    strong: '#D1D5DB',
  },
  text: {
    primary: '#14161A',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    disabled: '#C4C8CD',
  },
  accent: {
    // ONE brand/interactive accent — used for active states, selected
    // layers, primary buttons, focus rings, links. Nowhere else.
    default: '#2563EB',
    hover: '#1D4ED8',
    subtle: '#EFF4FF',   // tinted backgrounds for selected rows/chips
    text: '#1D4ED8',
  },
  semantic: {
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    successSubtle: '#F0FDF4',
    warningSubtle: '#FFFBEB',
    dangerSubtle: '#FEF2F2',
  },
  // Reserved for map DATA, not UI chrome. Keep saturated/distinct here
  // because these encode information (layer categories, facility
  // types, score bands) — this is the one place "colorful" is correct.
  dataCategorical: [
    '#2563EB', '#059669', '#D97706', '#DC2626',
    '#7C3AED', '#0891B2', '#DB2777', '#65A30D',
  ],
  dataSequential: { // for choropleths / score heatmaps (low→high)
    low: '#EFF4FF', mid: '#93B4F5', high: '#2563EB',
  },
};
```

### 2.2 Typography

```js
export const typography = {
  fontFamily: {
    ui: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    mono: `'IBM Plex Mono', ui-monospace, monospace`, // coordinates, IDs, code
  },
  scale: {
    caption:  { size: '11px', lineHeight: '16px', weight: 500, letterSpacing: '0.02em' }, // eyebrow/uppercase labels
    small:    { size: '12px', lineHeight: '16px', weight: 400 }, // secondary metadata
    body:     { size: '13px', lineHeight: '20px', weight: 400 }, // default UI text
    bodyMed:  { size: '13px', lineHeight: '20px', weight: 500 }, // emphasized body
    subtitle: { size: '14px', lineHeight: '20px', weight: 600 }, // card/section headers
    title:    { size: '16px', lineHeight: '24px', weight: 600 }, // panel titles
    pageTitle:{ size: '20px', lineHeight: '28px', weight: 600 }, // dashboard page headers only
    stat:     { size: '24px', lineHeight: '32px', weight: 600 }, // big numbers (stat cards, scores)
  },
};
```
Rule for the agent: **no font-size outside this scale anywhere in the app.** If a component seems to need something bigger, that's a signal it belongs on a dashboard page (`pageTitle`/`stat`), not inside a floating map panel.

### 2.3 Spacing, radius, shadow, motion, z-index

```js
export const spacing = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]; // px, use Tailwind's 0.5/1/2/3/4/5/6/8/10/12/16 steps mapped to these

export const radius = {
  sm: '6px',   // buttons, chips, inputs
  md: '10px',  // cards, panels
  lg: '14px',  // modals
  full: '9999px', // toggle pills, avatar
};

export const shadow = {
  none: 'none',
  xs: '0 1px 2px rgba(16, 24, 40, 0.05)',       // resting cards
  sm: '0 2px 8px rgba(16, 24, 40, 0.08)',       // floating panels over map
  md: '0 8px 24px rgba(16, 24, 40, 0.12)',      // modals, dropdowns
  focusRing: '0 0 0 3px rgba(37, 99, 235, 0.35)', // accessible focus, replaces glow
};

export const motion = {
  fast: '120ms',
  base: '180ms',
  slow: '260ms',
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // standard ease-out, no springs/bounces
};

export const zIndex = {
  map: 0,
  mapControls: 10,
  floatingPanel: 20,
  toolbar: 30,
  dropdown: 40,
  modal: 50,
  toast: 60,
};
```

### 2.4 Iconography

- Standardize on **`lucide-react`** (already available in this environment; check if it's in `frontend/package.json`, add if not) for every icon in the app — current and future. No mixing icon sets, no emoji-as-icon in production UI (the roadmap doc uses emoji like 📍🏢 as placeholders — replace all of these with proper `lucide-react` icons: `MapPin`, `Building2`, `Landmark`, `ShoppingBag`, `TreePine`, `Siren`, etc.).
- Icon sizes: `14px` inline with 12/13px text, `16px` in buttons/toolbar, `20px` for empty-state/feature illustrations. No other sizes.
- Icon color follows text color tokens (`text.secondary` default, `accent.default` when active) — never a separate icon-specific palette except in `dataCategorical` contexts (layer swatches, facility-type markers).

---

## 3. Reusable component primitives (the actual design system)

Instruct the agent to build these once, in `frontend/src/components/ui/`, and then **refactor every existing panel to consume them** rather than keeping bespoke markup per panel. Every future feature (investor dashboard, admin dashboard, reports UI) must also build from this list rather than adding new panel styles.

For each, specify props so the agent implements a real reusable API, not a copy-pasted style:

### `<Panel />`
Floating card container used for Layers, Identify, Zone Facilities, Facility Filter, and any future map-anchored panel.
- Props: `title`, `icon`, `onClose`, `collapsible` (bool), `anchor` ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'point'), `width` (default 340px), `children`.
- Style: `surface.raised` bg, `border.default` 1px, `radius.md`, `shadow.sm`, header row with `title` (typography.title) + optional icon + close/collapse button (IconButton).
- Behavior: mounts with `motion.base` fade+slide (8px) from its anchor edge. Only one `Panel` with `anchor` on the same side should be expanded at a time — collapsed panels shrink to a `IconButton` in a shared control cluster (see `<MapControlCluster />` below).

### `<Card />`
Generic content block used inside panels, dashboards, and modals (stat cards, list rows, zone summary cards).
- Props: `padding` ('sm'|'md'|'lg'), `interactive` (bool — adds hover bg tint + cursor pointer), `selected` (bool — adds `accent.subtle` bg + `accent.default` left border 2px).

### `<StatCard />`
For the Zone Facilities summary grid, and later for Admin Dashboard metrics / Investor score breakdowns.
- Props: `icon`, `value`, `label`, `trend` (optional, `+/-` for future analytics), `accentColor` (from `dataCategorical`, used only on the icon).
- Layout: icon top-left, `typography.stat` value, `typography.small` label below in `text.secondary`. No colored card backgrounds — color lives only in the icon.

### `<Toggle />` / `<Switch />`
Replaces checkboxes for all layer visibility controls, dark-mode, filters.
- Props: `checked`, `onChange`, `label`, `size` ('sm'|'md').
- Style: pill track `radius.full`, `accent.default` when on, `border.strong` track when off. No skeuomorphic gradients.

### `<IconButton />`
For toolbar actions, panel collapse/expand, map controls (zoom, basemap switch).
- Props: `icon`, `onClick`, `active` (bool), `tooltip` (string, shown via `<Tooltip />` on hover, not a permanent label).
- Style: 32×32px, `radius.sm`, transparent by default, `surface.sunken` bg on hover, `accent.subtle` bg + `accent.default` icon when `active`.

### `<MapControlCluster />`
A shared floating group for zoom controls, basemap switcher, and layer/identify/filter panel triggers — all styled identically as adjacent `IconButton`s in one `shadow.sm` rounded strip, positioned bottom-right (zoom) and top-right (panel triggers), mirroring Mapbox Studio's control layout. This replaces scattered individually-styled buttons.

### `<SearchInput />`
Used for place search today; reusable later for investor zone search, admin user search, facility search.
- Props: `placeholder`, `onSearch`, `results` (array), `renderResult` (render prop), `loading`.
- Style: single `radius.sm` input, leading search icon (`text.tertiary`), results in a `Panel`-style dropdown below with `Card interactive` rows.

### `<Modal />`
For report generation, comparison views, save-search dialogs, admin confirmations (roadmap explicitly calls for "Admin actions require confirmation").
- Props: `title`, `onClose`, `size` ('sm'|'md'|'lg'), `footer` (for primary/secondary action buttons), `children`.
- Style: centered, `shadow.md`, backdrop `surface.overlay`, closes on backdrop click or `Esc`.

### `<Tabs />`
Used today for Zone Facilities Panel ("Nearby Facilities" tab), and needed later for Investor zone comparison, Admin dashboard sections.
- Underline-style tabs, not boxed/pill tabs — thin `accent.default` 2px underline on active tab, `text.secondary` inactive.

### `<Badge />` / `<Chip />`
For facility type tags, layer group labels, status indicators (e.g., future "Open/Closed/Coming Soon" facility status from the roadmap).
- Small `radius.full` pill, `surface.sunken` bg + `text.secondary` by default; semantic colors (`semantic.successSubtle` + `semantic.success` text) for status variants.

### `<EmptyState />`
For "no results," "no saved searches yet," "no layers enabled" — the roadmap's Public Dashboard and Investor saved-searches features will need this repeatedly.
- Props: `icon`, `title`, `description`, `action` (optional button).
- Per the writing guidance below: empty states are an invitation to act, not an apology.

### `<Skeleton />`
Loading placeholder — thin animated bar/block, replaces any "futuristic scan/radar" loading animation.
- Props: `variant` ('text'|'card'|'row'), `count`.

### `<Tooltip />`
Wraps `IconButton` and any icon-only control, 4px offset, `surface.raised` bg, `shadow.sm`, `typography.small`, shown after a 300ms hover delay (not instant — avoids flicker on fast mouse movement across the toolbar).

---

## 4. Content & microcopy rules (applies to every panel, current and future)

Give the agent this so labels stay consistent as new services get built (this draws directly from established interface-writing practice):

- Name things by what the user controls, not backend terms. "Layers" not "Overlay Sources"; "Find nearest hospital" not "Nearest Facility Query."
- Buttons state the action in active voice: "Generate report," "Save search," "Compare zones" — and the resulting confirmation echoes the same verb: "Report generated," not "Success."
- Errors say what happened and what to do: "Couldn't load Cadastral layer — check your connection and retry," never a bare "Error" or stack trace in the UI.
- Empty states invite action: "No saved searches yet — save one from any zone analysis" with a button, not "No data."
- Sentence case everywhere (buttons, panel titles, tabs) — no ALL CAPS except `typography.caption` group labels (e.g., section eyebrows like "ADMINISTRATIVE LAYERS"), which is a deliberate hierarchy device, not decoration.

---

## 5. Component-by-component restyle instructions (current app)

### `frontend/src/config/basemaps.js`
- Set default basemap to a light/minimal style (OpenFreeMap "Positron" or "Liberty" light variant, or Mapbox Light if using Mapbox tiles). Keep any dark style as a selectable alternative in `<MapControlCluster />`, not the default.

### `MapLibreMapView.jsx`
- Default polygon/boundary layer opacity: 0.55–0.7, not 1.0, so basemap labels stay legible underneath.
- Replace any custom-positioned zoom/basemap buttons with `<MapControlCluster />`.
- Facility markers: remove CSS pulsing animation; use a one-time 200ms scale-in on mount, plus a static 2px `accent.default` ring around the selected/highlighted marker only.

### `ControlPanel.jsx` (layers)
- Rebuild using `<Panel anchor="top-right" title="Layers" icon={Layers}>`.
- Group by category (Administrative, Infrastructure, Environmental, etc.) with `typography.caption` uppercase group labels.
- Each row: `<Toggle />` + layer name (`typography.body`) + swatch (small `radius.sm` color square from `dataCategorical`) + opacity slider that appears only when that row is hovered/focused (use `<Slider />`, a new small primitive: thin track, `accent.default` fill, `radius.full` handle).
- Collapsed state: single `IconButton` (Layers icon) in `<MapControlCluster />`.

### `IdentifyPanel.jsx`
- Rebuild using `<Panel anchor="point">` anchored to the click location (Felt-style popup), or if a sidebar layout is kept for space reasons, use the *same* `<Panel anchor="top-right">` component the Layers panel uses — never a visually distinct one-off.
- Attributes as two-column rows inside `<Card padding="sm">`: key in `text.secondary`, value in `text.primary`, `border.subtle` hairline divider between rows, no per-attribute badges/boxes.

### Nearby Facility Finder
- Trigger: `<IconButton icon={Navigation} tooltip="Find nearest facility" />` in the toolbar.
- Facility type picker: use a `<SearchInput />`-adjacent dropdown or a simple `<Card interactive>` list, not a custom dropdown component.
- Result: `<Modal size="sm">` with facility name (`typography.subtitle`), distance/travel time (`typography.body`, `text.secondary`), and a "Get directions" button (primary, `accent.default`).

### Zone Facilities Panel
- Summary grid: 2-column grid of `<StatCard />` (icon, count, label) as specified in Section 3 — replace the emoji (📍🏢🛒 etc.) with `lucide-react` icons.
- "Nearby Facilities" tab uses `<Tabs />`; expanded facility list uses `<Card interactive>` rows with distance + rating (`<Badge />` for rating band if needed).

### Toolbar
- Rebuild as a single 52px bar: wordmark left (`typography.title`, `text.primary`, no gradient), `<SearchInput />` centered or left-aligned depending on available width, right-aligned `IconButton`s for account/settings, using `<MapControlCluster />` styling conventions for consistency.

### Place search
- Rebuild with `<SearchInput />` + dropdown results as `<Card interactive>` rows (place name + place type as `<Badge />`), matching Felt/Google Maps search patterns.

---

## 6. Extensibility — designing for the roadmap's future services

This is the section that makes the redesign durable. The project roadmap (see `docs/PROJECT-STATUS.md` / `docs/FORWARD-ROADMAP.md`) already defines upcoming surfaces: **Investor Dashboard, Admin Dashboard, Public Dashboard, PDF/report generation, spatial-analysis scoring views, Parliamentary/Electoral switch, Facility Filter Panel, saved searches/favorites, zone comparison.** None of these should require inventing new visual language. Give the agent this governance model:

### 6.1 Two page archetypes, not one style per feature
Define exactly two structural archetypes and require every current/future screen to be one of them:

1. **Map-first surface** (current app, Public Dashboard, most of Investor exploration): full-viewport map, floating `<Panel />`s and `<MapControlCluster />`, toolbar on top. This is what Section 5 covers.
2. **Dashboard surface** (Admin Dashboard, Investor saved-searches/reports list, zone comparison table, analysis history): standard content layout — left nav rail (icons + labels, `surface.raised`, `border.default` right edge) + main content area using `<Card />`, `<StatCard />`, `<Tabs />`, and a data table primitive (`<Table />` — add this to the design system when the Admin Dashboard is actually built, following the same token rules: `border.subtle` row dividers, `surface.sunken` header row, no zebra-striping unless density requires it).

Any new feature request should be triaged into one of these two archetypes before writing a single line of UI code.

### 6.2 Role-based visual consistency, not role-based re-theming
The roadmap defines three personas (Investor, Admin, Public) with different dashboards. Instruct the agent explicitly:

```
Do NOT give Investor/Admin/Public dashboards different color themes,
different panel styles, or different type scales "to differentiate
them." Differentiate by *content and navigation*, not by re-skinning
the design system per role. A shared visual language across roles is
what makes the product feel like one coherent platform instead of
three prototypes stapled together — this is a common failure mode to
explicitly avoid.
```

The only per-role variation allowed: which nav items/panels are visible, and using `dataCategorical`/`semantic` colors for role-relevant data (e.g., Investor score bands using `dataSequential`, Admin system-health using `semantic` colors) — never inventing a new neutral/surface palette per role.

### 6.3 Specific guidance for named upcoming features

- **PDF report generation (Week 7 spec)**: the exported PDF should mirror the token system — same `text.primary`/`text.secondary` hierarchy, same accent color for section headers, same `dataSequential` scale for score visualizations (radar/heatmap charts). Treat the PDF as a "print" theme of the same design system, not a separate brand.
- **Analysis scoring views** (Infrastructure/Accessibility/Environmental/Compatibility scores): use `<StatCard />` for the four scores plus `dataSequential` color coding for score bands (e.g., 0–40 `dataSequential.low`→`text.secondary` label "Needs improvement", 40–70 mid, 70–100 high→"Strong"). Never invent a new "gauge/dial" widget style without checking it against the restraint principle in Section 1 first — a simple horizontal bar with `dataSequential` fill is almost always the better (and more Felt-like) choice than a decorative radial gauge.
- **Parliamentary/Electoral switch**: implement as a `<Toggle />` inside the existing `<ControlPanel />` layer groups (Section 5), not a new standalone control — it's conceptually just another layer toggle with a richer click-to-inspect payload, which `<Panel anchor="point">` (reused from Identify) already handles.
- **Facility Filter Panel**: reuse `<Panel />` + `<Toggle />` rows exactly like the Layers panel (Section 5) — same component, different data source. Advanced filters (distance/rating/status) go in a collapsible sub-section inside the same panel using `<Tabs />` or a simple expand/collapse row, not a second panel.
- **Saved searches / favorites / analysis history** (Investor Dashboard, Week 8): this is a Dashboard-archetype surface (6.1). List rows use `<Card interactive>`, each with a `<Badge />` for zone type and an overflow `IconButton` (rename/delete/share) — mirror how file managers like Linear/Notion handle saved-item lists, which is the same restrained language, not a new pattern.
- **Zone comparison** (`compare-zones` endpoint): Dashboard archetype, side-by-side `<Card />` columns per zone with `<StatCard />` rows aligned across columns — same visual grammar as `comparison_card_display` style patterns, reusing existing primitives rather than a bespoke comparison table.
- **Admin system health / data sync controls**: Dashboard archetype, `<StatCard />` grid for metrics, `semantic` colors (success/warning/danger) reserved strictly for actual system-status meaning — never used decoratively elsewhere, so when a user sees red in the Admin dashboard it's unambiguous.

### 6.4 A living checklist for any future feature (put this in the repo, e.g. `docs/DESIGN-SYSTEM.md`)

Instruct the agent to write this checklist to the repo so future contributors (human or AI) follow it automatically:

```
Before building any new panel, dashboard, or view:
[ ] Identify which archetype it is: map-first or dashboard (6.1)
[ ] List which existing primitives from components/ui/ it will reuse
[ ] If a primitive doesn't exist yet, design it as a general-purpose
    addition to components/ui/ — not a one-off inline styled component
[ ] Confirm all colors come from tokens.js (surface/border/text/accent/
    semantic/dataCategorical/dataSequential) — no new hex values
[ ] Confirm all type sizes come from the typography scale
[ ] Confirm it degrades gracefully to mobile width (Section 7)
[ ] Confirm keyboard focus is visible (shadow.focusRing) and
    interactive elements are reachable by Tab
```

---

## 7. Responsive & accessibility baseline (applies to everything, now and future)

- Breakpoint: below 768px, floating `<Panel />`s become bottom sheets (slide up from bottom, full-width, rounded top corners only) instead of side-anchored cards — this is the standard mobile pattern Felt and Mapbox both use, and every future panel inherits it automatically since it's a `<Panel />` prop (`anchor="point"`/`"top-right"` etc. all collapse to `"bottom-sheet"` under the breakpoint), not something each feature reimplements.
- All `IconButton`s must have a `tooltip`/`aria-label` — no icon-only controls without an accessible name.
- Focus states use `shadow.focusRing` (Section 2.3), never rely on color alone (WCAG — the roadmap already lists "WCAG AA accessibility compliance" as a target for Week 8).
- Color contrast: verify `text.secondary` (#6B7280) on `surface.raised`/`surface.sunken` meets 4.5:1 for body text; if not, use a slightly darker secondary (`#5B6472`) — the agent should run a contrast check rather than assume.
- Respect `prefers-reduced-motion`: all `motion.*` transitions should no-op (or reduce to instant/opacity-only) when this is set.

---

## 8. Explicit before → after table

| Current (futuristic/congested) | Target (Felt/Mapbox subtle) |
|---|---|
| Dark glassmorphism panels, glow borders | White/light `<Panel />`, 1px `border.default`, `shadow.sm` |
| Multiple panels open at once | One primary `<Panel />` expanded per anchor; others collapsed to `IconButton` in `<MapControlCluster />` |
| Neon/gradient accents everywhere | Single `accent.default` (#2563EB), used only for active/selected/primary states |
| Pulsing/glowing markers | Static marker + one-time scale-in, static ring on selection |
| Emoji icons (📍🏢🛒) | `lucide-react` icon set, consistent sizing |
| Checkboxes for layers | `<Toggle />` pill switches |
| Bespoke panel styling per feature | Shared `<Panel />`/`<Card />`/`<StatCard />` primitives from `components/ui/` |
| Dense always-visible controls | Progressive disclosure — collapsed to icons until needed |
| Oversized bold headers throughout | Fixed `typography` scale, hierarchy via weight not size alone |
| Dark/neon basemap default | Light minimal basemap default, dark as opt-in toggle |
| Ad-hoc hex colors inline in components | All colors sourced from `tokens.js` |
| Each future dashboard risks its own theme | Two defined archetypes (6.1) + shared tokens enforce one visual language platform-wide |

---

## 9. Phased execution order

```
Phase 0 — Foundation (do first, nothing else depends-safely without it)
  - Create tokens.js / tokens.css
  - Extend tailwind.config.js to reference tokens
  - Add lucide-react if not present
  - Build components/ui/: Panel, Card, StatCard, Toggle, IconButton,
    MapControlCluster, SearchInput, Modal, Tabs, Badge, EmptyState,
    Skeleton, Tooltip, Slider
  - Write docs/DESIGN-SYSTEM.md with the Section 6.4 checklist

Phase 1 — Map & global chrome
  - Switch default basemap (light)
  - Rebuild zoom/basemap controls as MapControlCluster
  - Rebuild toolbar

Phase 2 — Layers panel (ControlPanel.jsx)
Phase 3 — Identify panel (IdentifyPanel.jsx)
Phase 4 — Facility finder + Zone Facilities panel
Phase 5 — Place search
Phase 6 — Verify responsive/mobile behavior + accessibility pass (Section 7)

Phase 7 — (When those roadmap features are actually built) apply
  Section 6.3 guidance to Investor Dashboard, Admin Dashboard,
  reports, and analysis views as they're implemented — no separate
  "redesign" needed later because they're built on the same system
  from day one.
```

After each phase, the agent should stop, list files changed, and flag anywhere it had to make a judgment call not explicitly covered above so you can confirm before continuing.

---

## 10. Constraints recap (paste-safe reminder for the agent)

```
- Presentation-layer only; no backend, API, or MapLibre data/source changes.
- All new shared components go in frontend/src/components/ui/.
- All colors/type/spacing must trace back to tokens.js — no inline hex.
- One archetype (map-first or dashboard) per screen, per Section 6.1.
- No feature-specific re-theming across Investor/Admin/Public roles.
- Every icon-only control needs a tooltip/aria-label.
- Respect prefers-reduced-motion.
- Work phase by phase per Section 9, reporting back after each phase.
```