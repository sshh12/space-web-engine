// §11 ladder consistency: compare the RESOLVED disc-atlas mean (baked surface,
// what the companion disc renders with once resolved) to discAlbedo (the far-POINT
// color + planetshine mean). For bodies whose bright look comes from a CLOUD deck,
// the disc shader overlays the deck so the two rungs reconcile. For Titan (bright
// look = ATMOSPHERE HAZE, no cloud deck) nothing reconciles them.
import { makeBaker, bakeDiscMap } from '../src/bakecore.js';
import { bodyById } from '../src/recipe.js';
import { discAlpha } from '../src/cloudcore.js';
for (const id of ['tellus', 'rubra', 'luna', 'titan', 'venus', 'saturn']) {
  const b = bodyById(id);
  const baker = makeBaker(b, { cacheMax: 32 });
  const m = bakeDiscMap(b, baker, 96, 48);
  let sum = [0, 0, 0], wA = 0;
  for (let i = 0; i < m.rgba.length; i += 4) {
    const a = m.rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) sum[c] += (m.rgba[i + c] / 255) * a;
    wA += a;
  }
  const discMean = sum.map((s) => s / Math.max(wA, 1e-6));
  const da = b.discAlbedo;
  // effective disc mean AFTER the cloud overlay the §11 disc shader applies
  let eff = [...discMean];
  const deck = b.clouds?.decks?.[0];
  if (deck) {
    // near-total-ish overlay: use the deck's own mean cov (approx via cov0 sat)
    const covApprox = Math.min(1, Math.max(0, (deck.cov0 ?? 0.2)));
    const alpha = discAlpha(deck, covApprox > 0.5 ? 1 : covApprox);
    const ca = deck.alb ?? [0.9, 0.9, 0.9];
    eff = discMean.map((v, c) => v * (1 - alpha) + ca[c] * alpha);
  }
  const meanEff = (eff[0] + eff[1] + eff[2]) / 3, meanDA = (da[0] + da[1] + da[2]) / 3;
  const ratio = meanEff / meanDA;
  console.log(`${id.padEnd(7)} discAtlasMean=[${discMean.map((v) => v.toFixed(2)).join(',')}]  +cloud=>[${eff.map((v) => v.toFixed(2)).join(',')}]  discAlbedo=[${da.map((v) => v.toFixed(2)).join(',')}]  effLum/pointLum=${ratio.toFixed(2)}`);
}
