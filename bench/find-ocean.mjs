// find ocean + coastline points on Tellus for Water v2 bench poses.
import { SYSTEM } from '../src/recipe.js';
import { makeBaker, sampleTileHeight, TILE_RES } from '../src/bakecore.js';
import { dirToFaceUv } from '../src/mathx.js';

const body = SYSTEM.bodies.find((b) => b.id === 'tellus');
const baker = makeBaker(body, { cacheMax: 4000 });
const level = 7, D = 1 << level;
const sea = body.seaLevel ?? 0;

function hAt(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  const dir = [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
  const f = dirToFaceUv(dir);
  const x = Math.min(Math.floor(f.u * D), D - 1), y = Math.min(Math.floor(f.v * D), D - 1);
  const tile = baker.bakeTile(f.face, level, x, y);
  return sampleTileHeight(tile, f.u * D - x, f.v * D - y);
}

// scan the near hemisphere; a coast = ocean cell with a land neighbour ~30 km away
const coasts = [], open = [];
const dd = 0.3; // ~33 km neighbour step
for (let lat = -35; lat <= 45; lat += 1.5) {
  for (let lon = -70; lon <= 90; lon += 1.5) {
    const h = hAt(lat, lon);
    if (h < sea) {
      const hN = hAt(lat + dd, lon), hE = hAt(lat, lon + dd), hS = hAt(lat - dd, lon), hW = hAt(lat, lon - dd);
      const landNbr = Math.max(hN, hE, hS, hW);
      if (landNbr > sea + 20) coasts.push({ lat, lon, h: Math.round(h), land: Math.round(landNbr) });
      else if (h < sea - 800) open.push({ lat, lon, h: Math.round(h) });
    }
  }
}
console.log('COASTS (ocean cell w/ land neighbour), first 12:');
for (const c of coasts.slice(0, 12)) console.log(`  lat ${c.lat}  lon ${c.lon}  depth ${sea - c.h}m  landNbr +${c.land}m`);
console.log(`\nOPEN OCEAN (deep), samples near lat 0-20:`);
for (const o of open.filter((o) => o.lat >= -5 && o.lat <= 25).slice(0, 8)) console.log(`  lat ${o.lat}  lon ${o.lon}  depth ${sea - o.h}m`);
console.log(`\n${coasts.length} coast cells, ${open.length} open-ocean cells found`);
