import { lazy, Suspense } from 'react';
import { ServiceGate } from './components/ServiceGate';

const DashboardMapPage = lazy(() =>
  import('./pages/DashboardMapPage').then((module) => ({ default: module.DashboardMapPage }))
);
const SharedPortfolioPage = lazy(() =>
  import('./pages/SharedPortfolioPage').then((module) => ({ default: module.SharedPortfolioPage }))
);
const LegalPage = lazy(() =>
  import('./pages/LegalPage').then((module) => ({ default: module.LegalPage }))
);
const AuthLinkPage = lazy(() =>
  import('./pages/AuthLinkPage').then((module) => ({ default: module.AuthLinkPage }))
);
const EmbedZonePage = lazy(() =>
  import('./pages/EmbedZonePage').then((module) => ({ default: module.EmbedZonePage }))
);

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  // Static pages that must work even when the API is down: no ServiceGate.
  if (path === '/terms' || path === '/privacy') {
    return (
      <Suspense fallback={null}>
        <LegalPage page={path.slice(1)} />
      </Suspense>
    );
  }
  if (path === '/verify-email' || path === '/reset-password') {
    return (
      <Suspense fallback={null}>
        <AuthLinkPage kind={path === '/verify-email' ? 'verify' : 'reset'} />
      </Suspense>
    );
  }
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
