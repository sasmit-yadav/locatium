const express = require('express');
const cors = require('cors');
const { corsOrigins } = require('./config');
const { healthLive, healthReady } = require('./controllers/health.controller');
const authRoutes = require('./routes/auth.routes');
const mapsRoutes = require('./routes/maps.routes');
const geocodeRoutes = require('./routes/geocode.routes');
const featuresRoutes = require('./routes/features.routes');
const harsacRoutes = require('./routes/harsac.routes');
const mapsController = require('./controllers/maps.controller');
const { proxyMapService } = require('./controllers/mapservice-proxy.controller');
const { mapsRateLimiter } = require('./middleware/maps-rate-limit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const asyncHandler = require('./middleware/async-handler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: true,
    })
  );

  app.use(express.json());

  app.get('/health', asyncHandler(healthLive));
  app.get('/api/health', asyncHandler(healthLive));
  app.get('/ready', asyncHandler(healthReady));
  app.get('/api/ready', asyncHandler(healthReady));

  app.use('/api/auth', authRoutes);

  app.use('/api', mapsRateLimiter, geocodeRoutes);
  app.use('/api', mapsRateLimiter, mapsRoutes);
  app.use('/api/features', mapsRateLimiter, featuresRoutes);
  app.use('/api/harsac', mapsRateLimiter, harsacRoutes);

  /** Optional ArcGIS MapServer REST proxy (legacy / tools). Frontend uses cached `/api/tiles` instead. */
  app.use('/api/mapservice', mapsRateLimiter, asyncHandler(proxyMapService));

  /** README legacy paths without `/api` prefix */
  app.get('/tiles/:layer/metadata.json', mapsRateLimiter, asyncHandler(mapsController.getTileMetadata));
  app.get('/tiles/:layer/:z/:x/:y.png', mapsRateLimiter, asyncHandler(mapsController.getTile));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
