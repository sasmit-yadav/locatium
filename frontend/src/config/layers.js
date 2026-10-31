/**

 * UI layer categories — each toggles per-table vector tiles via layer-registry.

 */



import { getCategoryMinZoom } from './layer-registry';
import { getCategoryLegendEntries } from './layer-legend';



/** lat, lng — MapLibre wants [lng, lat] for center */

export const INITIAL_MAP_CENTER = [28.45, 76.75];

export const DEFAULT_ZOOM = 9;



/** Operational layer requests are only useful around Haryana. */

export const HARYANA_BOUNDS = [74.0, 27.35, 77.85, 31.05];



/** @deprecated Use category.minZoom from DATA_LAYERS */

export function scaleToMinZoom(maxScale) {

  if (!maxScale || maxScale <= 0) return 0;

  const z = Math.log2(591657550.5 / maxScale);

  return Math.max(0, Math.min(22, Math.ceil(z)));

}



export const DATA_LAYERS = [

  {

    id: 'administrative',

    label: 'Administrative boundaries',

    minZoom: getCategoryMinZoom('administrative'),

    legend: getCategoryLegendEntries('administrative'),

  },

  {

    id: 'environmental',

    label: 'Environmental constraints',

    minZoom: getCategoryMinZoom('environmental'),

    legend: getCategoryLegendEntries('environmental'),

  },

  {

    id: 'cadastral',

    label: 'Cadastral',

    minZoom: getCategoryMinZoom('cadastral'),

    legend: getCategoryLegendEntries('cadastral'),

  },

  {

    id: 'social-infrastructure',

    label: 'Social infrastructure',

    minZoom: getCategoryMinZoom('social-infrastructure'),

    legend: getCategoryLegendEntries('social-infrastructure'),

  },

  {

    id: 'transportation',

    label: 'Transportation',

    /** 0 — airports & corridors use per-table minzoom; no category-wide zoom gate */
    minZoom: 0,

    legend: getCategoryLegendEntries('transportation'),

  },

  {

    id: 'utilities',

    label: 'Utilities',

    minZoom: getCategoryMinZoom('utilities'),

    legend: getCategoryLegendEntries('utilities'),

  },

  {

    id: 'industrial-investment',

    label: 'Industrial & investment zones',

    minZoom: getCategoryMinZoom('industrial-investment'),

    legend: getCategoryLegendEntries('industrial-investment'),

  },

];


