import { lazy, Suspense } from 'react';
import { ServiceGate } from './components/ServiceGate';

const DashboardMapPage = lazy(() =>
  import('./pages/DashboardMapPage').then((module) => ({ default: module.DashboardMapPage }))
);
const SharedPortfolioPage = lazy(() =>
  import('./pages/SharedPortfolioPage').then((module) => ({ default: module.SharedPortfolioPage }))
);
const EmbedZonePage = lazy(() =>
  import('./pages/EmbedZonePage').then((module) => ({ default: module.EmbedZonePage }))
);

export default function App() {
  const portfolioMatch = window.location.pathname.match(/^\/portfolio\/([^/]+)\/?$/);
  const embedMatch = window.location.pathname.match(/^\/embed\/(.+?)\/?$/);
  return (
    <ServiceGate>
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-ds-surface-base text-sm text-ds-text-secondary">Loading LOCATIUM…</div>}>
        {embedMatch ? (
          <EmbedZonePage zoneId={decodeURIComponent(embedMatch[1])} />
        ) : portfolioMatch ? (
          <SharedPortfolioPage token={decodeURIComponent(portfolioMatch[1])} />
        ) : (
          <DashboardMapPage />
        )}
      </Suspense>
    </ServiceGate>
  );
}
