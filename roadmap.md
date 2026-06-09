# LOCATIUM - Location Intelligence Platform for Haryana
## Spatial Analysis & Investment Site Selection System

A geospatial intelligence platform for Haryana, built around **official HARSAC MapServer** data. The **live app** exposes **8 operational layers** (see registry below); a 9th source (*Investment Zones*) exists at HARSAC but is **not** wired in the current registry.

**Tagline:** *"Smart location decisions, powered by spatial intelligence"*

**Detailed docs:** [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) (what exists) · [`docs/FORWARD-ROADMAP.md`](docs/FORWARD-ROADMAP.md) (next steps) · [`docs/STEP-BY-STEP-BUILD.md`](docs/STEP-BY-STEP-BUILD.md) (build walkthrough)

---

## 📋 Implementation status (accurate as of 2026-06-05)

This section reflects **the repository as built**. The 12-week roadmap further down mixes **done**, **partial**, and **future design** — use this table as the source of truth.

### Summary

| Area | Status |
|------|--------|
| Express API + health/ready | ✅ Done |
| JWT auth (register/login/refresh/logout/profile) | ✅ Done (needs PostgreSQL) |
| HARSAC tile proxy + identify + GeoJSON bbox | ✅ Done (8 layer slugs) |
| Redis tile cache | ✅ Supported (optional `REDIS_URL`) |
| Geocode API (Nominatim proxy) | ✅ Done |
| React map viewer | ✅ Done (**MapLibre GL JS** + cached `/api/tiles`) |
| Feature search / PostGIS analytics | ✅ Done (Week 4 complete) |
| Investor analysis / ML / admin portals | ❌ Not built |

### Operational layer slugs (backend + frontend must match)

| Slug | HARSAC service | In app |
|------|----------------|--------|
| `administrative` | Administrative_Boundaries | ✅ |
| `base-layers` | Base_Reference_Layers | ✅ |
| `constituencies` | Constituency_Boundaries | ✅ |
| `environmental` | Environmental_Constraints | ✅ |
| `cadastral` | Haryana_Cadastral | ✅ |
| `social-infrastructure` | Social_Infrastructure | ✅ |
| `transportation` | Transportation_Infrastructure | ✅ |
| `utilities` | Utilities | ✅ |
| `investment-zones` | Investment_Zones | ❌ Removed from registry (can re-add) |

### Implemented HTTP API (today)

```
GET  /api/health | /api/ready
POST /api/auth/register | /login | /refresh | /logout
GET  /api/auth/profile          (Bearer token)

GET  /api/maps/status
GET  /api/tiles/list
GET  /api/tiles/:layer/:z/:x/:y.png
GET  /api/tiles/:layer/metadata.json
GET  /api/maps/:layerKey?bbox=minLon,minLat,maxLon,maxLat
GET  /api/maps/:layerKey/info
POST /api/maps/identify
GET  /api/geocode/search?q=

GET  /api/features/search?keyword=...&layer=...
GET  /api/features/nearby?lat=...&lng=...&radius=...&type=...
GET  /api/features/:layerId/:featureId
GET  /api/features/statistics?layer=...
POST /api/features/within-bounds
POST /api/features/nearest-facility
GET  /api/features/zone-facilities-summary?zoneId=...
GET  /api/features/zone-facilities/:zoneId/:facilityType

GET  /api/mapservice/:slug/...    (ArcGIS REST proxy; optional, not used by UI)
GET  /tiles/:layer/:z/:x/:y.png   (legacy alias, same as /api/tiles)
```

### Frontend (today)

- **MapLibre GL JS** with **OpenFreeMap / OSM** basemaps (`frontend/src/config/basemaps.js`)
- Overlays: raster tiles → `/api/tiles/{slug}/{z}/{x}/{y}.png` (`MapLibreMapView.jsx`)
- Layers panel: toggle + opacity; **lazy** layer mount when first enabled
- Map click → `POST /api/maps/identify` → `IdentifyPanel`
- Place search: **local** Haryana gazetteer (`haryanaPlaces.js`), not Nominatim UI (API exists)
- **Nearby Facility Finder**: Button + modal to find closest facilities by type (Smart Facility Feature 1 ✅)
- **Zone Facilities Panel**: Shows nearby facilities summary when clicking on map features (Smart Facility Feature 2 ✅)
- Default: **administrative** layer on

### Differences from original README plan

| Planned | Actual |
|---------|--------|
| ArcGIS Maps SDK + Esri basemaps | **MapLibre** + OpenFreeMap/OSM (2026-06-04 migration) |
| 9 layers in UI | **8** layers (`investment-zones` omitted) |
| MapImageLayer / dynamic export in UI | **Cached XYZ tiles** (faster) |
| `PUT /api/auth/profile` | Not implemented |
| MongoDB, Socket.io, Python ML in repo | Not present — roadmap only |
| `compression` / request logging middleware | Not in `backend/package.json` |
| `audit_logs` table | Schema only — **not written by app code yet** |
| Per-user rate limit | **Per-IP** on `/api` map + geocode routes |
| Investor / analysis / features routes | Documented below as **future** |

---

## 🎯 Strategic Vision

**LOCATIUM** enables data-driven decision-making by making geospatial intelligence accessible—empowering investors to identify high-potential sites, administrators to optimize resource allocation, and citizens to understand their neighborhoods through integrated spatial analysis.

---

## 👥 User Personas & Their Needs

### 1. **INVESTORS** 🏢
- **Looking for:** Investment opportunities, infrastructure availability, regulatory zones, market potential
- **Key Features:**
  - Investment zone identification and feasibility analysis
  - Proximity analysis (distance to highways, airports, railway stations)
  - Infrastructure availability scoring (utilities, roads, social infrastructure)
  - Regulatory compliance checker (environmental constraints, cadastral data)
  - Market demand analysis using AI (population density, economic indicators)
  - ROI prediction based on location and zone type
  - Automated investment recommendation reports

### 2. **LOCAL ADMINISTRATORS & PLANNERS** 🏛️
- **Looking for:** Urban planning data, resource management, infrastructure monitoring, risk assessment
- **Key Features:**
  - Comprehensive administrative boundary visualization
  - Infrastructure and utility network mapping
  - Environmental constraint monitoring
  - Risk zone identification (floods, environmental hazards)
  - Population and social infrastructure density analysis
  - Resource allocation optimization
  - Administrative reports and compliance tracking
  - Multi-layer data analysis and overlay capabilities

### 3. **GENERAL POPULATION** 👥
- **Looking for:** Nearby services, safety information, environmental quality, local amenities
- **Key Features:**
  - Proximity-based search (hospitals, schools, parks, government offices)
  - Neighborhood quality scoring (safety, vegetation, infrastructure)
  - Environmental health indicators (NDVI, heat mapping, pollution zones)
  - Community resources finder
  - Safety alerts and risk notifications
  - Local amenities recommendation system
  - Easy-to-understand visualizations and insights

---

## 🏗️ Complete System Architecture

### **Technology Stack**

#### Frontend (current repo)
- **React 19** — UI
- **Vite** — Build tool
- **MapLibre GL JS** — Map view; operational overlays use **cached raster tiles** from **`/api/tiles`** (see [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md))
- **Tailwind CSS** — Styling

*Roadmap-only / not in `frontend/package.json` yet:* Redux, Axios, Recharts, React Query (listed elsewhere in this document as planned stack).

#### Backend (implemented in repo)
- **Node.js + Express.js** — REST API (`backend/`)
- **PostgreSQL + PostGIS** — schema + auth (`backend/db/schema.sql`); required for `/api/ready` and auth
- **Redis** — optional tile/query cache (`docker-compose.yml`, `REDIS_URL`)

#### Backend (roadmap — not in repo yet)
- **MongoDB** — logs/analytics (not implemented)
- **Socket.io** — real-time notifications (not implemented)

#### AI/ML & Data Processing
- **Python** - Data processing and ML models
- **TensorFlow/PyTorch** - Machine learning frameworks
- **Scikit-learn** - Data analysis and predictions
- **GDAL/Rasterio** - Geospatial data processing
- **Celery** - Asynchronous task processing
- **Apache Spark** - Large-scale data processing

#### DevOps & Deployment
- **Docker** - Containerization
- **Nginx** - Reverse proxy & caching
- **GitHub Actions** - CI/CD
- **AWS/Azure/GCP** - Cloud hosting

---

## 📡 MapServer Data Integration & API Endpoints

### **Data Sources (HARSAC MapServer)**

Nine services exist at HARSAC; **eight** are registered in `backend/src/config/maps-registry.js` and exposed in the UI.

| Service | URL | In app registry |
|---------|-----|-----------------|
| **Administrative Boundaries** | `.../Administrative_Boundaries/MapServer` | ✅ `administrative` |
| **Base Reference Layers** | `.../Base_Reference_Layers/MapServer` | ✅ `base-layers` |
| **Constituency Boundaries** | `.../Constituency_Boundaries/MapServer` | ✅ `constituencies` |
| **Environmental Constraints** | `.../Environmental_Constraints/MapServer` | ✅ `environmental` |
| **Haryana Cadastral** | `.../Haryana_Cadastral/MapServer` | ✅ `cadastral` |
| **Investment Zones** | `.../Investment_Zones/MapServer` | ❌ not registered |
| **Social Infrastructure** | `.../Social_Infrastructure/MapServer` | ✅ `social-infrastructure` |
| **Transportation Infrastructure** | `.../Transportation_Infrastructure/MapServer` | ✅ `transportation` |
| **Utilities** | `.../Utilities/MapServer` | ✅ `utilities` |

### **Backend API — implemented**

#### Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/profile          # Bearer access token
```

#### Maps & tiles (`:layerKey` = slug from registry)
```
GET    /api/maps/status
GET    /api/tiles/list
GET    /api/tiles/:layer/:z/:x/:y.png
GET    /api/tiles/:layer/metadata.json
GET    /api/maps/:layerKey?bbox=minLon,minLat,maxLon,maxLat
GET    /api/maps/:layerKey/info
POST   /api/maps/identify         # body: lng, lat, extent4326, layerKeys[], width, height
GET    /api/geocode/search?q=
```

#### Legacy / optional
```
GET    /api/mapservice/:slug/...  # ArcGIS REST passthrough
GET    /tiles/:layer/:z/:x/:y.png # same handler as /api/tiles
```

### **Backend API — planned (not in codebase)**

#### Feature Query Endpoints
```
GET    /api/features/search?type=...&keywords=...        # Search features across all layers
GET    /api/features/:layerType/:featureId               # Get specific feature details
GET    /api/features/nearby?lat=...&lng=...&radius=...&type=...  # Find nearby features
POST   /api/features/within-bounds                       # Query features in polygon/bounds
```

#### Analysis & Processing Endpoints
```
GET    /api/analysis/proximity?lat=...&lng=...&radius=...        # Proximity analysis
GET    /api/analysis/neighborhood-score?geom=...                 # Neighborhood quality score
GET    /api/analysis/infrastructure-density?bbox=...             # Infrastructure availability
POST   /api/analysis/investment-zones-info?coordinates=...       # Investment zone details
GET    /api/analysis/accessibility?lat=...&lng=...               # Accessibility scoring
POST   /api/analysis/risk-zones?location=...&type=...            # Environmental risk zones
```

#### Investor Portal Endpoints
```
GET    /api/investor/opportunities?criteria=...&budget=...       # Investment opportunities
GET    /api/investor/zone-analysis/:zoneId                       # Detailed zone analysis
POST   /api/investor/generate-report?zoneId=...&parameters=...   # Generate investor report
GET    /api/investor/comparisons?zones=...                       # Compare multiple zones
GET    /api/investor/market-data?location=...                    # Market intelligence
```

#### Admin Dashboard Endpoints
```
GET    /api/admin/layer-status                                   # All layers status
GET    /api/admin/data-analytics?timeframe=...                   # System analytics
GET    /api/admin/user-statistics                                # User engagement data
POST   /api/admin/layer-update?layerId=...                       # Trigger layer update
```

#### Public Endpoints
```
GET    /api/public/nearby-services?lat=...&lng=...               # Nearby hospitals, schools, etc
GET    /api/public/neighborhood-info?location=...                # Neighborhood overview
GET    /api/public/local-amenities?lat=...&lng=...&type=...      # Local facilities finder
GET    /api/public/safety-alerts?location=...                    # Safety & risk alerts
```

*(Tile endpoints above are implemented under `/api/tiles/...`.)*

---

## 🎨 Frontend Implementation Strategy

### **User Role-Based Dashboards**

#### Investor Dashboard
- Interactive map with operational layers toggleable (8 in registry today)
- Investment zone visualization with details
- Proximity analysis to infrastructure
- ROI calculator based on zone characteristics
- Custom report generation (PDF export)
- Comparison tool for multiple zones

#### Admin Dashboard
- Layer management & update controls
- Multi-layer overlay analysis
- Administrative boundary management
- Infrastructure network visualization
- Alert configuration & monitoring
- User & system statistics

#### Public Dashboard
- Simple map with search functionality
- Nearby amenities finder
- Neighborhood quality indicator
- Safety & environmental alerts
- Local resources directory
- Community feedback section

---

## 🎨 Frontend Implementation Strategy

### **User Role-Based Dashboards**

#### Investor Dashboard
- Interactive map with investment zones highlighted
- Investment opportunity cards with AI recommendations
- ROI calculator and comparison tool
- Proximity analysis visualizations
- Custom report builder
- Project tracking dashboard

#### Admin Dashboard
- Administrative boundary management
- Infrastructure network visualization
- Resource allocation tools
- Multi-layer data analysis
- Alert management system
- Compliance reporting

#### Public Dashboard
- Simple nearby search interface
- Neighborhood information cards
- Safety alerts
- Community ratings and reviews
- Environmental quality indicators
- Local resources finder

---

## 🔄 Data Integration Pipeline

### **Data Sources Integration**
1. **ArcGIS MapServer Layers** (all 9 services)
   - Scheduled sync every 24 hours
   - Real-time updates for critical layers
   - Version control and change tracking

2. **Real-Time Sensors**
   - Temperature, humidity, air quality sensors
   - IoT devices integration
   - Stream processing with Apache Kafka

3. **External Data Sources**
   - Census data
   - Market data APIs
   - Traffic and navigation APIs
   - Weather services

### **Data Processing Pipeline**
```
Raw Data → Validation → Transformation → Geospatial Processing → 
ML Model Training → Database Storage → API Caching → Frontend
```

---

## 🚀 Refined Implementation Roadmap (12 Weeks)

**Focus:** MVP Launch → Investor Feature Complete → Hardened Deployment

**Effort Estimate:** 1,280 hours total (160h/week development + QA + documentation)

> **How to read this roadmap:** Weeks **1–3** are **partially implemented** (see [Implementation status](#-implementation-status-accurate-as-of-2026-06-04)). Week **4+** is mostly **design**. Checkboxes in Weeks **5–11** were aspirational — they are **not** built unless the top status table says so.

---

### **PHASE 1: CORE PLATFORM (Weeks 1-4)**

#### Week 1: Backend Foundation & Authentication (40h)
**Goal:** Production-ready Node.js backend with secure auth

**Deliverables:**
- [x] Express.js server (CORS, JSON body, centralized errors)
- [ ] Request logging / `compression` middleware (not added yet)
- [x] JWT authentication (register, login, refresh, logout, GET profile)
- [ ] `PUT /api/auth/profile` (not implemented)
- [x] User roles in DB (`investor`, `admin`, `public`); new users default to `investor`
- [ ] Role-based route guards beyond `/api/auth/profile` (not implemented)
- [x] PostgreSQL + PostGIS schema (`users`, `refresh_tokens`, `audit_logs`, `features`)
- [ ] `audit_logs` writes from application code (table exists only)
- [x] Error handling & validation on auth + maps
- [x] `docker-compose.yml` for Postgres + Redis locally
- [ ] Production Dockerfile / staging deploy (not in repo)

**Success Metrics:**
- All auth endpoints tested & documented (Swagger)
- JWT expiry: 7d access, 30d refresh
- 100% middleware coverage, error responses consistent
- Zero unhandled exceptions in logs

**Output:** Authenticated API on `localhost:3001` + staging deployment

---

#### Week 2: MapServer Integration & Tile Caching (35h)
**Goal:** All 9 MapServer layers accessible via optimized tile API

**Architecture:**
```
Request → API Gateway → Redis Cache → MapServer Proxy → Response
                         ↓ (cache hit/miss logged)
```

**Deliverables:**
- [x] Tile proxy: `GET /api/tiles/:layer/:z/:x/:y.png` (+ in-memory cache; Redis optional)
- [x] **8** MapServer slugs in `maps-registry.js` (see status table; Investment Zones **not** registered)
- [x] Redis caching when `REDIS_URL` set (tile TTL default 24h; bbox query cache ~1h)
- [x] Rate limiting on `/api` maps + geocode (**per IP**, dev limit higher than prod)
- [x] Bbox GeoJSON/query proxy: `GET /api/maps/:layerKey?bbox=...`
- [x] `POST /api/maps/identify`, `GET /api/maps/status`

**Success Metrics:**
- Response time p95 < 150ms (cached), < 300ms (uncached)
- Cache hit rate > 80%
- Zero dropped requests at 50 concurrent users
- All 8 registered layers render at zoom 8-18

**Output:** Fully functional tile server at `localhost:3001/api/tiles/*`

---

#### Week 3: Frontend MVP - Interactive Map (38h)
**Goal:** Production React UI with layer controls & interactions

**Tech Stack (implemented):**
- React 19 + Vite + Tailwind
- **MapLibre GL JS** — raster overlays → **`/api/tiles/...`**; basemaps OpenFreeMap / OSM

**Deliverables:**
- [x] Map viewer (`MapLibreMapView.jsx`) + basemap picker
- [x] Operational layers via **cached tile proxy** (slug-aligned registry)
- [x] Layer control (checkboxes, opacity) + sliding panel; lazy layer load
- [x] Feature inspection (map click → `POST /api/maps/identify` → `IdentifyPanel`)
- [x] Place search — **local** Haryana gazetteer (`haryanaPlaces.js`); `GET /api/geocode/search` exists but UI not wired
- [ ] Map legend with color schemes
- [ ] Mobile polish beyond current responsive layout
- [ ] Loading states & error boundaries

**Success Metrics:**
- Map loads enabled layers in < 2 seconds (after tile cache warm)
- Smooth pan/zoom (60fps consistently)
- Cross-browser: Chrome, Firefox, Safari, Edge
- Mobile: functional navigation, readable text

**Output:** Interactive map at `localhost:5173`, fully responsive

---

#### Week 4: Feature Querying & Basic Analytics (35h) ✅ **COMPLETED**
**Goal:** Search & discover spatial features, view layer statistics

**Repo status:** ✅ **IMPLEMENTED** (2026-06-05) - All `/api/features/*` endpoints operational with PostGIS queries. Sample data seeded (22 features across 7 layers).

**Deliverables:**
- [x] Feature search: `GET /api/features/search?keyword=...&layer=...`
- [x] Proximity search: `GET /api/features/nearby?lat=&lng=&radius=2km&type=hospital`
- [x] Spatial filters (bbox, polygon, intersection) - `POST /api/features/within-bounds`
- [x] Feature detail API: `GET /api/features/:layerId/:featureId`
- [x] Layer statistics endpoint: feature counts, geometry summaries - `GET /api/features/statistics`
- [ ] API documentation (Swagger/OpenAPI generated) - Optional, can be added later

**Database Queries:**
```sql
-- Feature search (indexed on name, layer_id)
SELECT * FROM features WHERE layer_id=$1 AND name ILIKE $2 LIMIT 50;

-- Proximity (PostGIS spatial index)
SELECT * FROM features WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1,$2),4326), $3) LIMIT 50;

-- Feature detail with relationships
SELECT f.*, COUNT(nearby.*) as nearby_count 
FROM features f LEFT JOIN features nearby ON ST_DWithin(...)
WHERE f.id = $1;
```

**Success Metrics:**
- Search < 500 features in < 200ms
- Feature detail < 100ms
- Query accuracy > 99%
- Swagger docs complete & auto-updated

**Output:** Searchable feature database + stats dashboard

---

## 🗺️ ENHANCED LAYER SYSTEM & SMART FEATURES (Integrated into Weeks 2-4)

### Additional Administrative Subdivisions

**New Layers to Integrate (Week 2-3):**

These layers provide finer administrative/cadastral divisions for detailed location analysis:

| Layer Name | Type | Use Case | Features |
|-----------|------|----------|----------|
| **Constitutional Boundary** | Polygons | Electoral district identification | Parliamentary constituencies, voting zones |
| **Cadastral Subdivisions** | Polygons | Land parcel boundaries | Enhanced from base cadastral layer |
| **Controlled Area** | Polygons | Restricted/controlled zones | Military, security, hazard areas |
| **NCR District** | Polygons | National Capital Region zones | Delhi metro influence zones |
| **Municipal Boundary** | Polygons | City/Municipality limits | Urban jurisdiction limits |
| **Licensed Colony** | Polygons | Residential colony divisions | Sector-wise residential planning |
| **HSIIDC Zone** | Polygons | Industrial development areas | Haryana State Industrial areas |
| **HSVP Sector** | Polygons | Urban development sectors | Haryana Shahari Vikas sectors |

**Integration Details:**

- **Week 2 Expansion (5h added):**
  - Load 4 new administrative layers (Constitutional, NCR, Municipal, Controlled)
  - Add to tile proxy system: `/api/tiles/constitutional/:z/:x/:y`, etc.
  - Implement layer toggle UI for these 4 new layers
  - Redis caching same as core layers (24hr TTL)

- **Week 3 Expansion (5h added):**
  - Load 4 cadastral/development layers (Cadastral Subdivisions, Licensed Colony, HSIIDC, HSVP)
  - Add opacity controls for overlapping polygons
  - Create layer group management (group related layers)
  - Color-coded legend for each subdivision type

**API Endpoints Added:**
```
GET /api/tiles/constitutional/:z/:x/:y
GET /api/tiles/municipal-boundary/:z/:x/:y
GET /api/tiles/licensed-colony/:z/:x/:y
GET /api/tiles/hsiidc-zone/:z/:x/:y
GET /api/tiles/hsvp-sector/:z/:x/:y
GET /api/tiles/controlled-area/:z/:x/:y
GET /api/tiles/ncr-district/:z/:x/:y
GET /api/features/administrative-subdivision?location=...
```

---

### Smart Facility & Proximity Features

**Week 4 Enhancement: Smart Facility Finder (8h added)**

**Feature 1: "Nearby Closest Facility" Button** ✅ **IMPLEMENTED**

Location: Map toolbar, quick access button

**Functionality:**
```
User clicks "Find Closest Facility"
  ↓
Select facility type (dropdown):
  - Nearest Hospital
  - Nearest School
  - Nearest Government Office
  - Nearest Market/Commercial
  - Nearest Park/Green Space
  - Nearest Police Station
  - Nearest Fire Station
  ↓
Auto-detect user's location (or use selected point)
  ↓
Algorithm: Find single closest facility using spatial index
  ↓
Display:
  - Marker on map (pulsing animation)
  - Sidebar: Facility name, distance, type, contact (if available)
  - Directions link (Google Maps/Apple Maps)
  - Estimated travel time
```

**API Endpoint:**
```
POST /api/features/nearest-facility
{
  "lat": 28.5,
  "lng": 76.9,
  "facility_type": "hospital",
  "max_distance_km": 10
}
Response: {
  "facility_id": "f123",
  "name": "Max Hospital Gurgaon",
  "type": "hospital",
  "distance_km": 2.3,
  "coordinates": [28.48, 76.91],
  "travel_time_min": 5,
  "address": "...",
  "phone": "..."
}
```

---

**Feature 2: "Proximity Zone Facilities" Panel** ✅ **IMPLEMENTED**

Location: Right sidebar, activated when user clicks a zone

**Functionality:**
```
User clicks on investment zone / municipality / sector on map
  ↓
Zone Details Sidebar Opens
  ↓
New Tab: "Nearby Facilities"
  ↓
Display summary cards:
  📍 Hospitals: 8 within 2km | 15 within 5km
  📚 Schools: 12 within 2km | 24 within 5km
  🏢 Government Offices: 3 within 2km | 7 within 5km
  🛒 Commercial: 25 within 2km | 50+ within 5km
  🌳 Parks: 5 within 2km | 12 within 5km
  🚔 Emergency Services: 2 police, 1 fire station
  ↓
Click any facility type → Expand list
  ↓
Show all matching facilities:
  - Distance from zone center
  - Sorting options (distance, rating, type)
  - Click facility → Show on map with marker
```

**API Endpoints:**
```
GET /api/features/in-zone/:zoneId/facilities-summary
Response: {
  "zone_id": "z1",
  "zone_name": "Manesar Industrial",
  "facilities_count": {
    "hospitals": {"2km": 8, "5km": 15},
    "schools": {"2km": 12, "5km": 24},
    "offices": {"2km": 3, "5km": 7},
    "commercial": {"2km": 25, "5km": 50},
    "parks": {"2km": 5, "5km": 12},
    "police": 2,
    "fire": 1
  }
}

GET /api/features/in-zone/:zoneId/:facilityType?sort=distance&limit=50
Response: [
  {
    "id": "fac_001",
    "name": "Delhi Heart Hospital",
    "type": "hospital",
    "distance_from_zone_km": 1.2,
    "rating": 4.5,
    "address": "...",
    "coordinates": [28.5, 76.9]
  },
  ...
]
```

---

**Feature 3: "Parliamentary / Electoral Switch"**

Location: Map controls, checkbox or toggle

**Functionality:**
```
New Checkbox: "Show Parliamentary Constituency"
  ↓
When ENABLED:
  - Display Constitutional Boundary layer
  - Show constituency name/ID on polygon
  - Color-coded by political region (optional)
  - Show voter count, area, demographics tooltip
  
When DISABLED:
  - Hide Constitutional Boundary layer
  - Keep other layers visible
  ↓
Click on constituency polygon:
  - Show sidebar with details:
    - Constituency name & code
    - District & state
    - Voter population
    - Area sq.km
    - Nearby zones/areas
    - Previous election results (if data available)
```

**API Endpoint:**
```
GET /api/features/constituency/:constituencyId
Response: {
  "id": "const_001",
  "name": "Gurgaon Constituency",
  "type": "parliamentary",
  "geometry": {...},
  "properties": {
    "voter_population": 850000,
    "area_sq_km": 450,
    "district": "Gurgaon",
    "parliamentary_seat": "Gurgaon (LS)",
    "state": "Haryana"
  }
}

GET /api/tiles/constitutional/:z/:x/:y
```

---

**Feature 4: "Facility Filter Panel"**

Location: Left sidebar, expandable

**Functionality:**
```
New UI Component: Facility Type Filters
  ☑ Hospitals (8 visible on map)
  ☑ Schools (12 visible)
  ☑ Government Offices (3 visible)
  ☑ Commercial Centers (25 visible)
  ☐ Parks (hide/show toggle)
  ☐ Police Stations (toggle)
  ☐ Fire Stations (toggle)
  
Each filter has:
  - Checkbox (show/hide from map)
  - Count of visible facilities
  - Color indicator (matching map marker)
  - Click to zoom to all facilities of that type
  
Advanced Filters (collapsible):
  - Distance from selected point: 1km, 2km, 5km, 10km
  - Rating: ⭐ 4+, 3-4, below 3
  - Status: Open, Closed, Coming Soon
```

**API Endpoint:**
```
GET /api/features/filter?types=hospital,school&distance=5&lat=28.5&lng=76.9
Response: [
  {facility objects with filtered results}
]
```

---

**Week 4 Enhancement Summary:**

| Feature | Type | Effort | API Calls | UI Components |
|---------|------|--------|-----------|---------------|
| Nearby Closest Facility | Button + Modal | 2h | 1 new | 1 button, 1 modal ✅ |
| Proximity Zone Facilities | Sidebar Tab | 3h | 2 new | Tab, cards, list ✅ |
| Parliamentary Switch | Toggle | 1h | 1 existing | 1 checkbox |
| Facility Filter Panel | Sidebar Panel | 2h | 1 new | 6-8 checkboxes |
| **Total Week 4 Addition** | | **8h** | **5 endpoints** | **Multiple** |

**Integration Point in Roadmap:**
- This is considered part of Week 4 optimization (increases Week 4 from 35h → 43h)
- OR can be pushed to Week 4.5 as "Polish & UX Enhancement" (3-4 days)
- Recommended: Include in Week 4 to keep UI cohesive

---

### **PHASE 2: INVESTOR INTELLIGENCE (Weeks 5-8)** — *design only, not implemented*

#### Week 5: Spatial Analysis Engine (40h)
**Goal:** Core algorithms for location scoring (4 dimensions)

**Algorithm 1: Infrastructure Density (0-100)**
```
Sources: hospitals, schools, gov offices (within 5km)
Formula: 
  Score = min(100, 
    (hospitals_count * 15) + 
    (schools_count * 10) + 
    (offices_count * 5)
  )
```

**Algorithm 2: Accessibility Index (0-100)**
```
Factors with inverse distance weighting:
  - Highway distance (max 20km, weight 0.3)
  - Railway distance (max 30km, weight 0.25)
  - Airport distance (max 60km, weight 0.25)
  - Urban center distance (max 50km, weight 0.2)
Score = Σ(weights * (1 - normalized_distance))
```

**Algorithm 3: Environmental Risk (0-100, inverted)**
```
Risk = min(100,
  (forest_proximity_risk * 0.4) +
  (flood_zone_risk * 0.3) +
  (water_body_risk * 0.2) +
  (air_quality_risk * 0.1)
)
```

**Algorithm 4: Zone Compatibility (0-100)**
```
For industrial zone at location:
  - Nearby industrial: +10 (cluster effect)
  - Residential within 2km: -15 (nuisance)
  - Utilities available: +20
  - Near transportation: +15
  - Environmental constraints: -25
```

**Deliverables:**
- [ ] Scoring endpoint: `POST /api/analysis/score-location`
- [ ] Batch processing: `POST /api/analysis/score-batch` (up to 100 zones)
- [ ] Returns: individual scores + overall composite score
- [ ] Visualization data (GeoJSON with scores for heatmap)

**Success Metrics:**
- Single location scored in < 500ms
- Batch 100 zones in < 3 seconds
- Scores validated against 10 manual samples (expert review)
- Algorithms documented with examples

**Output:** Working spatial analysis API with 4 validated algorithms

---

#### Week 6: Investment Opportunity Discovery (42h)
**Goal:** Rank & recommend investment zones with machine-readable criteria

**Ranking Formula:**
```
Opportunity_Score = 
  (Infrastructure_Score * 0.25) +
  (Accessibility_Score * 0.20) +
  (ZoneType_Match * 0.30) +
  (Available_Area_km2 / max_area * 0.15) +
  (Growth_Potential * 0.10)

Growth_Potential = f(population_density, nearby_development, proximity_to_city)
```

**Deliverables:**
- [ ] Endpoint: `GET /api/investor/opportunities?sector=industrial&budget=high&risk=medium`
- [ ] Endpoint: `GET /api/investor/zones?sort=rank&limit=20&filters=...`
- [ ] Zone profiles (area, utilities, infrastructure count, distances)
- [ ] Comparison matrix: `GET /api/investor/compare-zones?zones=z1,z2,z3,z4`
- [ ] Benchmark data (similar successful zones for reference)

**Filter Options:**
- Sectors: industrial, commercial, residential, agricultural
- Zone types: government, private, cooperative
- Budget: low (<2cr), medium (2-10cr), high (>10cr)
- Risk tolerance: low, medium, high

**Success Metrics:**
- Opportunity search < 300ms
- Comparison load < 500ms
- Top 20 zones clearly differentiated by score
- Validation: compare against domain expert rankings

**Output:** Investor opportunity portal API + ranking engine

---

#### Week 7: Reports & Visualizations (38h)
**Goal:** PDF reports & interactive dashboard for investment analysis

**PDF Report Contents (8-12 pages):**
1. Executive Summary (1 page)
   - Location name, coordinates, overall score
   - Go/No-go recommendation
   
2. Location Overview (1 page)
   - Map with zone highlighted
   - Basic facts (area, district, zone type)
   
3. Scoring Analysis (2 pages)
   - All 4 algorithms explained
   - Score breakdown (Infrastructure 78, Accessibility 82, etc.)
   - Comparison to regional average
   
4. Infrastructure Assessment (2 pages)
   - Table: nearby facilities (hospitals, schools, offices)
   - Road density, utility availability
   - Map overlay of services
   
5. Environmental Assessment (1 page)
   - Forest proximity, flood zone status
   - Water resources, air quality
   - Compliance checklist
   
6. Distance Matrix (1 page)
   - Highway, railway, airport distances
   - Urban center distance
   - Similar zones nearby (benchmarks)
   
7. Recommendations & Next Steps (1 page)
   - Top 3 positive factors
   - Top 3 risk factors
   - Suggested actions

**Deliverables:**
- [ ] Report generation: `POST /api/investor/generate-report?zoneId=z1&format=pdf`
- [ ] Report stored in cloud (S3) with 7-day expiry
- [ ] Dashboard visualizations:
  - Heatmap (infrastructure density)
  - Accessibility contours
  - Ranking chart (top 20)
  - Radar chart (zone comparison)
- [ ] Export options: PDF, CSV, GeoJSON

**Success Metrics:**
- Report generation < 5 seconds
- PDF professionally formatted & branded
- All visualizations render correctly
- CSV validated for Excel/Google Sheets

**Output:** Production PDF reports + interactive dashboard

---

#### Week 8: Investor Dashboard & Polish (40h)
**Goal:** Complete investor portal with saved searches, favorites, sharing

**Dashboard Features:**
- [ ] Personal workspace (profile, settings)
- [ ] Saved searches (5 max, with save/load)
- [ ] Favorite zones (bookmarks with notes)
- [ ] Analysis history (last 20 analyses)
- [ ] Quick stats (zones analyzed, reports generated)

**Advanced Filters:**
- [ ] Sector, zone type, budget, risk tolerance
- [ ] Custom radius for amenity searches
- [ ] Date range for trend analysis

**Sharing & Collaboration:**
- [ ] Shareable links for zone analysis (no login required)
- [ ] Email report to stakeholders
- [ ] Embed HTML snippet in external websites

**UX/Performance:**
- [x] Basic responsive map shell (partial — current LOCATIUM viewer)
- [ ] Dark/light mode toggle (dark basemap only today)
- [ ] WCAG AA accessibility compliance
- [ ] Code splitting / Lighthouse targets

**Success Metrics:**
- Bundle size < 200KB gzipped
- Page load < 2 seconds
- Lighthouse score > 85
- Zero console errors
- Mobile Lighthouse > 80

**Output:** Complete investor portal, production-ready

---

### **PHASE 3: HARDENING & LAUNCH (Weeks 9-12)** — *mostly not implemented*

#### Week 9: Admin Dashboard & System Management (35h)
**Goal:** Admin controls for data sync, user management, system health

**Deliverables:**
- [ ] Admin login + 2FA support (TOTP ready)
- [ ] Role-based access (super-admin, admin, operator)
- [ ] Data management (layer sync, logs, rollback)
- [ ] User management UI
- [ ] System health dashboard (metrics graphs)
- [x] `GET /api/maps/status` only (minimal ops signal today)

**Success Metrics:**
- Dashboard loads in < 1 second
- All operations logged & auditable
- System metrics real-time (< 5s refresh)
- Admin actions require confirmation

**Output:** Admin dashboard with full control

---

#### Week 10: Security Hardening (30h)
**Goal:** Production security standards (OWASP Top 10 compliant)

**Checklist:**
- [ ] HTTPS/SSL in production
- [x] Rate limiting on map/geocode routes (per IP; see `MAP_RATE_LIMIT_*`)
- [ ] DDoS / WAF (production)
- [x] CORS via `CORS_ORIGINS`
- [x] Input validation on auth + maps + geocode
- [x] Parameterized SQL for auth
- [ ] CSP / XSS hardening on frontend
- [ ] CSRF (N/A for bearer-token API today)
- [ ] JWT key rotation automation
- [x] Password min length (default 12 via `PASSWORD_MIN_LENGTH`)
- [ ] Login audit trail (`audit_logs` not wired)
- [ ] Encryption at rest / backups
- [x] Secrets via `.env` (not committed)
- [ ] Docker image scanning / clean `npm audit` gate in CI

**Success Metrics:**
- Pass OWASP Top 10 checklist
- Zero security warnings in dependencies
- Rate limiting tested under load
- Backup restore tested successfully

**Output:** Security-hardened application

---

#### Week 11: Performance & Scalability Testing (35h)
**Goal:** Production-grade performance under real-world load

**Caching Strategy:**
- Browser: tiles (1 month), API (5 min)
- Server (Redis): queries (1hr), features (24hr)
- CDN-ready for static assets

**Database Optimization:**
- Indexes on all filter/search columns
- Query analysis & optimization (EXPLAIN ANALYZE)
- Connection pooling (10 connections)
- Query response time p95 < 100ms

**API Optimization:**
- Gzip compression (all responses)
- Pagination (max 1000 results)
- Field selection (return only needed)
- Batch endpoint for multiple queries
- Response time targets:
  - Tiles: < 100ms
  - Features: < 200ms
  - Analysis: < 500ms
  - Reports: < 5s

**Load Testing:**
- 100 concurrent users sustained
- 1000 req/sec sustained
- Measure: latency, throughput, error rate
- Document results with graphs

**Success Metrics:**
- p95 response time < 300ms
- 99.9% uptime (simulated)
- Support 100+ concurrent users
- Zero errors under load
- Cache hit rate > 85%

**Output:** High-performance, scalable system

---

#### Week 12: Deployment & Launch (40h)
**Goal:** Production deployment with monitoring & user launch

**Infrastructure:**
- [ ] PostgreSQL + PostGIS database provisioning
- [ ] Node.js backend deployment (Docker on VPS/AWS)
- [ ] Frontend deployment (S3 + CloudFront CDN)
- [ ] SSL certificates (production-grade)
- [ ] Domain setup & DNS configuration

**Monitoring & Logging:**
- [ ] Error tracking (Sentry/Rollbar)
- [ ] Application performance monitoring (New Relic/DataDog)
- [ ] Log aggregation (ELK Stack / CloudWatch)
- [ ] Uptime monitoring & alerts (UptimeRobot)
- [ ] On-call alert rotation ready

**Documentation & Launch:**
- [ ] User guide (PDF + video tutorials)
- [ ] API documentation (auto-generated Swagger)
- [ ] Deployment guide (for future maintainers)
- [ ] Troubleshooting guide (common issues)
- [ ] Data sources citations (HARSAC)

**Launch Activities:**
- [ ] Final regression testing
- [ ] Production database migration
- [ ] Smoke tests in production
- [ ] User onboarding (email + guide)
- [ ] Launch announcement
- [ ] 24/7 support for first week

**Post-Launch (Ongoing):**
- [ ] Monitor system daily (first 2 weeks)
- [ ] Fix critical bugs immediately (< 1hr MTTR)
- [ ] Collect user feedback
- [ ] Plan Phase 2 enhancements

**Success Metrics:**
- Zero critical bugs in production
- < 1 hour MTTR for incidents
- 10+ beta investors onboarded
- 99.9% uptime (first week)
- Positive user feedback

**Output:** Live production system with active users

---

## 📊 12-Week Milestone Checklist

| Week | Phase | Milestone | Status |
|------|-------|-----------|--------|
| 1 | Foundation | Backend + Auth ready | 🟡 Partial (no PUT profile, no audit writes) |
| 2 | Foundation | Map tile API + 8 layers | 🟡 Partial (Redis optional; not 9 layers) |
| 3 | Foundation | Interactive Map UI live | 🟡 Done (MapLibre + tiles + identify) |
| 4 | Foundation | Feature Search + Stats API | ⬜ Not started |
| 5 | Intelligence | Spatial Analysis 4 algorithms | ⬜ Design only |
| 6 | Intelligence | Opportunity Discovery engine | ⬜ Design only |
| 7 | Intelligence | PDF Reports + Dashboard | ⬜ Design only |
| 8 | Intelligence | Investor Portal complete | ⬜ Design only |
| 9 | Hardening | Admin Dashboard ready | ⬜ Not started |
| 10 | Hardening | Security audit passed | 🟡 Partial (basics only) |
| 11 | Hardening | Load testing passed | ⬜ Not started |
| 12 | Launch | Production live + 10 users | ⬜ Not started |

---

## Project Name: LOCATIUM

**Why This Name?**
- **Location** + **Premium/Intelligence** (Latin suffix -ium)
- **Powerful** for B2B positioning
- **Memorable** and pronounceable globally
- **Technical credibility** (similar to premium platforms)
- **Aligns with** core value: "Location Intelligence"

**Alternative Names Considered:**
- **INFRAWISE** - Infrastructure Intelligence (clear but generic)
- **GEOLYTICS** - Geospatial Analytics (technical but longer)
- **STADHAAR** - Urban Foundation (culturally relevant, Sanskrit blend)
- **AARAHI** - Navigator/Direction (Hindi, unique appeal)

---

## 🔧 API Testing Strategy

### Map API smoke tests
```bash
# Health + HARSAC token
curl "http://localhost:3001/api/health"
curl "http://localhost:3001/api/maps/status"

# Tile (repeat for cache HIT header)
curl -I "http://localhost:3001/api/tiles/administrative/9/356/243.png"

# GeoJSON bbox
curl "http://localhost:3001/api/maps/administrative?bbox=76.6,28.3,77.2,28.7"

# Geocode (planned UI; API works)
curl "http://localhost:3001/api/geocode/search?q=Gurgaon"

# Not implemented yet:
# curl "http://localhost:3001/api/features/nearby?lat=28.5&lng=76.9&radius=5000&type=hospital"
```

---

## 🛠️ Development Quick Start

```powershell
# Optional: database + Redis
docker compose up -d

# Backend
cd backend
Copy-Item .env.example .env   # set HARSAC credentials + DATABASE_URL
npm install
npm run db:migrate
npm run dev

# Frontend (second terminal)
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Maps status | http://localhost:3001/api/maps/status |

---

## 📊 Success Metrics & KPIs

| Metric | Target | Timeline |
|--------|--------|----------|
| API Response Time | < 500ms | Week 14 |
| System Uptime | 99.9% | Week 15 |
| Concurrent Users | 100+ | Week 14 |
| Data Freshness | < 24hrs | Week 1 |
| User Adoption | 500+ investors | Week 16 |
| Page Load Time | < 3s | Week 14 |
| Cache Hit Rate | > 80% | Week 13 |
| Error Rate | < 0.1% | Week 14 |

---

## 🔒 Security Checklist (repo reality)

- [x] JWT access + refresh (`JWT_*` in `.env`)
- [ ] Role-based guards on map/analysis routes (roles stored, not enforced)
- [x] Input validation on implemented routes
- [x] Parameterized SQL (auth)
- [ ] Frontend CSP / hardening
- [x] CORS (`CORS_ORIGINS`)
- [x] Rate limiting (maps/geocode, per IP)
- [ ] HTTPS in production
- [ ] Audit logging to `audit_logs` table
- [x] Secrets in environment only

---

## 📝 Project Structure (actual)

```
Investmap/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/           # maps-registry.js, env config
│   │   ├── routes/           # auth, maps, geocode
│   │   ├── controllers/
│   │   ├── services/         # maps-proxy, auth, geocode, redis, tokens
│   │   ├── middleware/
│   │   └── db/pool.js
│   ├── db/schema.sql
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/       # MapLibreMapView, ControlPanel, IdentifyPanel, …
│   │   ├── config/           # layers, basemaps, api
│   │   ├── services/         # mapsIdentify, mapsStatus, geocode
│   │   └── data/haryanaPlaces.js
│   └── package.json
├── docs/
│   ├── PROJECT-STATUS.md
│   ├── FORWARD-ROADMAP.md
│   └── STEP-BY-STEP-BUILD.md
├── docker-compose.yml        # PostGIS + Redis
├── map_new/                  # Legacy static GIS (not used by React app)
└── README.md
```

## 📊 Data flow (current map viewer)

1. **MapLibre** requests basemap tiles (OpenFreeMap / OSM).
2. Enabled overlays request **`/api/tiles/:slug/{z}/{x}/{y}.png`** (Vite proxies to backend in dev).
3. Backend serves from memory/Redis or exports from HARSAC on miss.
4. Map click → **`POST /api/maps/identify`** → **IdentifyPanel** shows attributes.

## 🔮 Next steps

See [`docs/FORWARD-ROADMAP.md`](docs/FORWARD-ROADMAP.md): feature API, PostGIS sync, analysis/ML, investor portal, production deploy.

---

**LOCATIUM** — location intelligence for Haryana · HARSAC data via MSME MapServer services
