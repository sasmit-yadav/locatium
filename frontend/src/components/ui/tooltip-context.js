import { createContext } from 'react';

/**
 * Lets a container (e.g. a vertical strip on the map's right edge) choose where its
 * tooltips open, so they don't cover the neighbouring buttons or run off-screen.
 */
export const TooltipSideContext = createContext(null);
