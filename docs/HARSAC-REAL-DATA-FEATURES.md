# HARSAC Real Data Analysis Feature

## Overview

This feature enables **real-time analysis of actual HARSAC MapServer data** without relying on PostgreSQL seed data. Users can select any point on the map and find all facilities within a specified radius across three key layers.

## What's New

### Backend API Endpoints

#### 1. Query Nearby Features (Single Layer)
```
GET /api/harsac/nearby?layer=social-infrastructure&lat=28.48&lng=76.98&radius=5
```
- Returns all features from a specific layer within radius (km)
- Response includes distance from center point

#### 2. Query Multiple Layers at Once
```
GET /api/harsac/multi-nearby?lat=28.48&lng=76.98&radius=5&layers=social-infrastructure,transportation,utilities
```
- **Default layers**: social-infrastructure, transportation, utilities
- Returns features from all specified layers
- Groups results by layer

#### 3. Query Features in Bounding Box
```
GET /api/harsac/in-bbox?layer=social-infrastructure&bbox=76.5,28.0,77.5,29.0
```
- Returns all features within a rectangular area

#### 4. Get All Features for a Layer
```
GET /api/harsac/layers/social-infrastructure/features?limit=100&offset=0
```
- Paginated access to all features in a layer across Haryana

### Frontend Features

#### Area Selection Tool
- Click "Find Facility" button in the header
- Select which layers to search (Social Infrastructure, Transportation, Utilities)
- Set search radius (1-20 km)
- Click on map to set center point
- View all matching facilities as colored markers
- Click markers to see details

#### Visual Markers
- **Red markers**: Social Infrastructure (hospitals, schools, etc.)
- **Blue markers**: Transportation (roads, railways, airports)
- **Yellow markers**: Utilities (power, water facilities)
- **Dashed red circle**: Shows search radius
- **Labels**: Facility names appear on hover/zoom

## Setup Instructions

### Prerequisites
1. HARSAC MapServer credentials (token or username/password)
2. Backend running on port 3001
3. Frontend running on port 5173

### 1. Configure Backend

Ensure your `backend/.env` file has HARSAC credentials:

```env
# HARSAC Authentication (choose one method)
MAP_SERVER_TOKEN=your_token_here
# OR
MAP_SERVER_USERNAME=your_username
MAP_SERVER_PASSWORD=your_password

# Optional: Redis for caching
REDIS_URL=redis://localhost:6379
```

### 2. Start Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Test the Feature

1. Open http://localhost:5173
2. Click "Find Facility" button in the header
3. Select layers (all three are selected by default)
4. Adjust radius slider (default: 5km)
5. Click "Select Point on Map"
6. Click anywhere on the map
7. Wait for results to load
8. View markers and click them for details

## API Response Format

### Multi-Nearby Response
```json
{
  "success": true,
  "center": { "lat": 28.48, "lng": 76.98 },
  "radiusMeters": 5000,
  "totalFeatures": 45,
  "layers": ["social-infrastructure", "transportation", "utilities"],
  "results": {
    "social-infrastructure": {
      "features": [
        {
          "id": "12345",
          "layerId": "social-infrastructure",
          "name": "District Hospital",
          "type": "social-infrastructure",
          "geometry": {
            "type": "Point",
            "coordinates": [76.98, 28.49]
          },
          "distanceKm": 1.2,
          "properties": { /* HARSAC attributes */ }
        }
      ],
      "cacheHit": false
    },
    "transportation": { /* ... */ },
    "utilities": { /* ... */ }
  }
}
```

## Caching

- Results are cached in Redis (if configured) for better performance
- Cache TTL: 1 hour for queries
- Cache key format: `harsac:nearby:{layer}:{lat},{lng}:{radius}`

## Limitations

1. **HARSAC Server Dependency**: Requires HARSAC MapServer to be online and accessible
2. **Token Required**: Must have valid HARSAC credentials
3. **Rate Limiting**: API calls are rate-limited to prevent abuse
4. **Query Timeout**: 30-second timeout per layer query
5. **Geometry Types**: Works best with point features; polygons/lines may have centroid-based distances

## Troubleshooting

### "HARSAC MapServer requires a token"
- Set `MAP_SERVER_TOKEN` or `MAP_SERVER_USERNAME`/`MAP_SERVER_PASSWORD` in `backend/.env`

### "MapServer query timed out"
- HARSAC server may be slow or unreachable
- Check network connectivity
- Try a smaller radius

### No features found
- The selected area may not have facilities in the chosen layers
- Try a larger radius
- Ensure the layer is active in HARSAC

### Markers not showing
- Check browser console for errors
- Verify the API returned data
- Ensure map instance is properly initialized

## Future Enhancements

- [ ] Export results to CSV/GeoJSON
- [ ] Filter by specific facility types within layers
- [ ] Heatmap visualization of facility density
- [ ] Routing/directions to selected facility
- [ ] Compare multiple search results
- [ ] Save searches to history
- [ ] Print-friendly report generation