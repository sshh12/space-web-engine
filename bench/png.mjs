// bench/png.mjs — minimal, zero-dependency PNG decode for the metrics scripts.
// Supports what Puppeteer emits (8-bit RGB / RGBA / gray, non-interlaced) — enough
// for scoring frames; anything fancier should be re-encoded before scoring anyway
// (the R4 protocol pushes real and rendered images through ONE normalization path).

import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePNG(buf) {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.bitDepth !== 8) throw new Error(`unsupported bit depth ${ihdr.bitDepth}`);
  if (ihdr.interlace) throw new Error('interlaced PNG unsupported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`unsupported color type ${ihdr.colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const { width: W, height: H } = ihdr;
  const stride = W * channels;
  const out = new Uint8Array(stride * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const rb = raw[p + x];
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rb; break;
        case 1: v = rb + a; break;
        case 2: v = rb + b; break;
        case 3: v = rb + ((a + b) >> 1); break;
        case 4: { // Paeth
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = v & 0xff;
    }
    p += stride;
  }
  return { width: W, height: H, channels, data: out };
}

export function readPNG(path) { return decodePNG(readFileSync(path)); }

// linear-ish luminance in [0,1] (sRGB decoded with gamma 2.2 — consistent across
// both sides of every comparison, which is what matters for the tell metrics)
export function luminance(img) {
  const { width: W, height: H, channels: C, data } = img;
  const lum = new Float32Array(W * H);
  const g = new Float32Array(256);
  for (let i = 0; i < 256; i++) g[i] = Math.pow(i / 255, 2.2);
  for (let i = 0; i < W * H; i++) {
    const b = i * C;
    lum[i] = C >= 3
      ? 0.2126 * g[data[b]] + 0.7152 * g[data[b + 1]] + 0.0722 * g[data[b + 2]]
      : g[data[b]];
  }
  return { lum, W, H };
}
