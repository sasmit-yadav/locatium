/**
 * Major Haryana towns — district HQ and frequent urban centres for instant client-side search.
 * Coordinates are approximate map centres (WGS84).
 */
export const HARYANA_PLACES = [
  { id: 'hr-ambala', label: 'Ambala', lng: 76.7789, lat: 30.3782, zoom: 12 },
  { id: 'hr-kurukshetra', label: 'Kurukshetra', lng: 76.8769, lat: 29.9695, zoom: 12 },
  { id: 'hr-thanesar', label: 'Thanesar', lng: 76.8319, lat: 29.9729, zoom: 12 },
  { id: 'hr-panchkula', label: 'Panchkula', lng: 76.8517, lat: 30.6959, zoom: 12 },
  { id: 'hr-pinjore', label: 'Pinjore', lng: 76.8679, lat: 30.7989, zoom: 13 },
  { id: 'hr-yamunanagar', label: 'Yamunanagar', lng: 77.2674, lat: 30.129, zoom: 12 },
  { id: 'hr-karnal', label: 'Karnal', lng: 76.9897, lat: 29.6857, zoom: 12 },
  { id: 'hr-kaithal', label: 'Kaithal', lng: 76.3988, lat: 29.8019, zoom: 12 },
  { id: 'hr-jind', label: 'Jind', lng: 76.3146, lat: 29.3159, zoom: 12 },
  { id: 'hr-narwana', label: 'Narwana', lng: 76.1189, lat: 29.5929, zoom: 12 },
  { id: 'hr-safidon', label: 'Safidon', lng: 76.6719, lat: 29.4099, zoom: 12 },
  { id: 'hr-sirsa', label: 'Sirsa', lng: 75.0289, lat: 29.5369, zoom: 12 },
  { id: 'hr-fatehabad', label: 'Fatehabad', lng: 75.0549, lat: 29.5129, zoom: 12 },
  { id: 'hr-ratia', label: 'Ratia', lng: 75.5849, lat: 29.6889, zoom: 12 },
  { id: 'hr-hisar', label: 'Hisar', lng: 75.7217, lat: 29.1492, zoom: 11 },
  { id: 'hr-hansi', label: 'Hansi', lng: 75.9629, lat: 29.0979, zoom: 12 },
  { id: 'hr-bhiwani', label: 'Bhiwani', lng: 76.1397, lat: 28.7975, zoom: 12 },
  { id: 'hr-charkhi-dadri', label: 'Charkhi Dadri', lng: 76.2739, lat: 28.5929, zoom: 12 },
  { id: 'hr-rohtak', label: 'Rohtak', lng: 76.5816, lat: 28.8955, zoom: 12 },
  { id: 'hr-jhajjar', label: 'Jhajjar', lng: 76.6569, lat: 28.6069, zoom: 12 },
  { id: 'hr-bahadurgarh', label: 'Bahadurgarh', lng: 76.9359, lat: 28.6929, zoom: 12 },
  { id: 'hr-sonipat', label: 'Sonipat', lng: 77.0158, lat: 28.9931, zoom: 12 },
  { id: 'hr-gohana', label: 'Gohana', lng: 76.6999, lat: 29.1369, zoom: 12 },
  { id: 'hr-panipat', label: 'Panipat', lng: 76.9699, lat: 29.3919, zoom: 12 },
  { id: 'hr-samalkha', label: 'Samalkha', lng: 77.0199, lat: 29.2369, zoom: 12 },
  { id: 'hr-palwal', label: 'Palwal', lng: 77.3269, lat: 28.1439, zoom: 12 },
  { id: 'hr-faridabad', label: 'Faridabad', lng: 77.3178, lat: 28.4089, zoom: 11 },
  { id: 'hr-ballabhgarh', label: 'Ballabhgarh', lng: 77.3249, lat: 28.3389, zoom: 12 },
  { id: 'hr-gurugram', label: 'Gurugram', lng: 77.0266, lat: 28.4595, zoom: 11 },
  { id: 'hr-manesar', label: 'Manesar', lng: 76.9349, lat: 28.3839, zoom: 12 },
  { id: 'hr-rewari', label: 'Rewari', lng: 76.6189, lat: 28.1929, zoom: 12 },
  { id: 'hr-bawal', label: 'Bawal', lng: 76.5949, lat: 28.2049, zoom: 12 },
  { id: 'hr-mahendragarh', label: 'Mahendragarh', lng: 76.1499, lat: 28.2739, zoom: 12 },
  { id: 'hr-narnaul', label: 'Narnaul', lng: 76.1449, lat: 28.0339, zoom: 12 },
  { id: 'hr-nuh', label: 'Nuh', lng: 77.0279, lat: 28.1039, zoom: 12 },
  { id: 'hr-firozpur-jhirka', label: 'Firozpur Jhirka', lng: 76.9419, lat: 27.7989, zoom: 12 },
  { id: 'hr-tauru', label: 'Tauru', lng: 76.9419, lat: 28.2189, zoom: 12 },
  { id: 'hr-shahabad', label: 'Shahabad Markanda', lng: 76.8699, lat: 30.1699, zoom: 12 },
  { id: 'hr-ellenabad', label: 'Ellenabad', lng: 74.6619, lat: 29.4539, zoom: 12 },
  { id: 'hr-tohana', label: 'Tohana', lng: 75.9089, lat: 29.7129, zoom: 12 },
  { id: 'hr-pehowa', label: 'Pehowa', lng: 76.5849, lat: 29.9789, zoom: 12 },
  { id: 'hr-cheeka', label: 'Cheeka', lng: 76.6249, lat: 30.0539, zoom: 12 },
  { id: 'hr-assandh', label: 'Assandh', lng: 76.6149, lat: 29.5289, zoom: 12 },
  { id: 'hr-kharkhauda', label: 'Kharkhauda', lng: 76.8849, lat: 28.8789, zoom: 12 },
];

function normalize(s) {
  return s.trim().toLowerCase();
}

/** @param {string} query */
export function filterHaryanaPlaces(query) {
  const q = normalize(typeof query === 'string' ? query : '');
  if (q.length < 2) return [];

  const scored = [];
  for (const p of HARYANA_PLACES) {
    const name = normalize(p.label);
    if (!name.includes(q)) continue;
    let score = name.startsWith(q) ? 0 : 10;
    score += name.indexOf(q);
    score += Math.min(name.length, 40) * 0.01;
    scored.push({ place: p, score });
  }
  scored.sort((a, b) => a.score - b.score || a.place.label.localeCompare(b.place.label));
  const seen = new Set();
  const out = [];
  for (const { place } of scored) {
    const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: place.id,
      label: `${place.label}, Haryana, India`,
      lng: place.lng,
      lat: place.lat,
      zoom: place.zoom ?? 11,
      type: 'City',
    });
    if (out.length >= 14) break;
  }
  return out;
}
