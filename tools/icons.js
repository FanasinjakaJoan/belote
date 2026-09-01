'use strict';
/**
 * Icon pipeline — no native deps.
 * Decodes tools/icon-src.png (RGB8), area-averages it down to every size the
 * PWA / Android / iOS need, and writes them to public/icons/.
 *
 *   node tools/icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, 'icon-src.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');
const BG = [10, 59, 44];          // emerald felt
const WHITE_CUT = 232;            // near-white pixels are treated as "outside"

// ── CRC / PNG encoding ──────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(px, w, h, channels) {
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  // adaptive per-scanline filtering (minimum sum of absolute differences)
  for (let y = 0; y < h; y++) {
    const row = y * stride, up = (y - 1) * stride;
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? px[row + x - channels] : 0;
        const b = y > 0 ? px[up + x] : 0;
        const c = x >= channels && y > 0 ? px[up + x - channels] : 0;
        let v;
        if (f === 0) v = px[row + x];
        else if (f === 1) v = px[row + x] - a;
        else if (f === 2) v = px[row + x] - b;
        else if (f === 3) v = px[row + x] - ((a + b) >> 1);
        else v = px[row + x] - paeth(a, b, c);
        v &= 0xff;
        cand[f][x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── PNG decoding (8-bit, non-interlaced, colour type 2 or 6) ───────────────
function decodePNG(buf) {
  let o = 8, w = 0, h = 0, ch = 3;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.slice(o + 4, o + 8).toString('ascii');
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('only 8-bit PNGs supported');
      ch = data[9] === 6 ? 4 : data[9] === 2 ? 3 : (() => { throw new Error('colour type ' + data[9]); })();
      if (data[12]) throw new Error('interlaced PNGs not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(stride * h);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      px[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, ch, px };
}

// ── resampling ──────────────────────────────────────────────────────────────
/** Area-average resize to size×size, returning RGB floats. */
function resize(img, size) {
  const { w, h, ch, px } = img;
  const out = new Float32Array(size * size * 3);
  const sx = w / size, sy = h / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(h, Math.ceil((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(w, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * ch;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      const o = (y * size + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

const q = (v) => Math.min(255, Math.round(Math.round(v / 6) * 6));

/** Compose the resized art onto a canvas. mode: 'alpha' | 'opaque' | 'maskable' */
function compose(img, size, mode) {
  const inner = mode === 'maskable' ? Math.round(size * 0.8) : size;
  const art = resize(img, inner);
  const off = Math.round((size - inner) / 2);
  const channels = mode === 'alpha' ? 4 : 3;
  const out = Buffer.alloc(size * size * channels);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * channels;
      let r = BG[0], g = BG[1], b = BG[2], a = mode === 'alpha' ? 0 : 255;
      const ax = x - off, ay = y - off;
      if (ax >= 0 && ay >= 0 && ax < inner && ay < inner) {
        const i = (ay * inner + ax) * 3;
        const [pr, pg, pb] = [art[i], art[i + 1], art[i + 2]];
        const white = pr > WHITE_CUT && pg > WHITE_CUT && pb > WHITE_CUT;
        if (!white) { r = pr; g = pg; b = pb; a = 255; }
        else if (mode !== 'alpha') { r = BG[0]; g = BG[1]; b = BG[2]; a = 255; }
      }
      // gentle posterise: kills the source's film grain so PNG compresses well
      out[o] = q(r); out[o + 1] = q(g); out[o + 2] = q(b);
      if (channels === 4) out[o + 3] = a;
    }
  }
  return encodePNG(out, size, size, channels);
}

// ── run ─────────────────────────────────────────────────────────────────────
const img = decodePNG(fs.readFileSync(SRC));
fs.mkdirSync(OUT, { recursive: true });
// 1024 is only needed for App Store submission: node tools/icons.js --store
const jobs = [
  ['icon-192.png', 192, 'alpha'],
  ['icon-512.png', 512, 'alpha'],
  ['icon-180.png', 180, 'opaque'],   // apple-touch-icon must be opaque
  ['icon-32.png', 32, 'opaque'],
  ['maskable-512.png', 512, 'maskable'],
];
if (process.argv.includes('--store')) jobs.push(['icon-1024.png', 1024, 'opaque']);
if (process.argv.includes('--reencode')) {   // shrink the master art itself
  fs.writeFileSync(SRC, compose(img, 768, 'opaque'));
  console.log('  icon-src.png       re-encoded at 768×768');
}
for (const [name, size, mode] of jobs) {
  const png = compose(img, size, mode);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log('  ' + name.padEnd(18) + size + '×' + size + '  ' + (png.length / 1024).toFixed(1) + ' kB  (' + mode + ')');
}
console.log('icons written to public/icons/');
