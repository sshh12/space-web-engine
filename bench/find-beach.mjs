// find a beach: a land cell at the waterline, with the compass bearing to the
// nearest ocean so the camera can be aimed at the surf. Prints candidates.
import { SYSTEM } from '../src/recipe.js';
import { makeBaker, sampleTileHeight } from '../src/bakecore.js';
import { dirToFaceUv } from '../src/mathx.js';

const body = SYSTEM.bodies.find((b) => b.id === 'tellus');
const baker = makeBaker(body, { cacheMax: 6000 });
const level = 8, D = 1 << level;
const sea = body.seaLevel ?? 0;
function hAt(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180, cl = Math.cos(lat);
  const dir = [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
  const f = dirToFaceUv(dir);
  const x = Math.min(Math.floor(f.u * D), D - 1), y = Math.min(Math.floor(f.v * D), D - 1);
  return sampleTileHeight(baker.bakeTile(f.face, level, x, y), f.u * D - x, f.v * D - y);
}
// land cell (just above sea) with an ocean neighbour; bearing = yaw to the sea
// (0=north,+east). Scan low latitudes for a good sun; want a broad shallow apron.
const beaches = [];
for (let lat = -25; lat <= 25; lat += 1) {
  for (let lon = -70; lon <= 90; lon += 1) {
    const h = hAt(lat, lon);
    if (h > sea + 2 && h < sea + 90) {
      const dirs = [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]];
      let best = null;
      for (const [dlat, dlon, bearing] of dirs) {
        const hn = hAt(lat + dlat * 0.25, lon + dlon * 0.25);
        const hf = hAt(lat + dlat * 0.6, lon + dlon * 0.6);
        if (hn < sea - 4 && hf < sea - 30) { best = { bearing, deep: Math.round(sea - hf) }; break; }
      }
      if (best) beaches.push({ lat, lon, h: Math.round(h), bearing: best.bearing, deep: best.deep });
    }
  }
}
// prefer bigger sea aprons at usable latitudes
beaches.sort((a, b) => b.deep - a.deep);
console.log('BEACH candidates (stand on land, look at bearing toward sea):');
for (const b of beaches.slice(0, 14)) console.log(`  lat ${b.lat}  lon ${b.lon}  landH ${b.h}m  sea-bearing ${b.bearing}deg  offshoreDepth ${b.deep}m`);
console.log(`\n${beaches.length} beach cells`);
