// find-land.mjs — dev helper: scan the deterministic baker for interesting ground-
// shot locations (land, relief) without opening a browser. node test/find-land.mjs
import { makeBaker, TILE_RES, I, sampleTileHeight } from '../src/core/bakecore.js';
import { bodyById } from '../src/core/recipe.js';
import { dirToFaceUv } from '../src/core/mathx.js';

const body = bodyById(process.argv[2] || 'tellus');
const baker = makeBaker(body);
const level = 7;
const spots = [];
for (let lat = -60; lat <= 60; lat += 4) {
  for (let lon = -180; lon < 180; lon += 4) {
    const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
    const dir = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
    const { face, u, v } = dirToFaceUv(dir);
    const D = 1 << level;
    const x = Math.min(Math.floor(u * D), D - 1), y = Math.min(Math.floor(v * D), D - 1);
    const t = baker.bakeTile(face, level, x, y);
    const h = sampleTileHeight(t, u * D - x, v * D - y);
    if (h > 150) spots.push({ lat, lon, h: Math.round(h), relief: Math.round(t.maxH - t.minH) });
  }
}
spots.sort((a, b) => b.relief - a.relief);
console.log('highest-relief land spots (lat, lon, h, tile relief):');
for (const s of spots.slice(0, 12)) console.log(`  lat ${s.lat}  lon ${s.lon}  h ${s.h} m  relief ${s.relief} m`);
console.log(`\nland fraction of samples: ${(spots.length / (31 * 90) * 100).toFixed(0)}%`);
