// Generates the app icons with zero dependencies (hand-rolled PNG encoder).
// node tools/make-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(S) {
  const buf = Buffer.alloc(S * S * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const sa = a / 255, da = buf[i + 3] / 255, oa = sa + da * (1 - sa);
    if (oa === 0) return;
    buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };
  const rect = (x0, y0, w, h, c, a) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, c, a);
  };

  const BG = [14, 16, 20], BLUE = [77, 163, 255], GREEN = [123, 216, 143], WHITE = [238, 241, 246];
  rect(0, 0, S, S, BG);

  const u = S / 24;                       // 24-unit design grid
  // two document halves
  rect(2.6 * u, 4 * u, 7 * u, 16 * u, BLUE);
  rect(14.4 * u, 4 * u, 7 * u, 16 * u, GREEN);
  // faint "rows" of a table on each half
  for (let r = 0; r < 5; r++) {
    rect(3.6 * u, (5.6 + r * 2.9) * u, 5 * u, 0.9 * u, BG, 110);
    rect(15.4 * u, (5.6 + r * 2.9) * u, 5 * u, 0.9 * u, BG, 110);
  }
  // the jagged cut seam down the middle
  const cx = 12 * u, amp = 1.15 * u, period = 3.2 * u, thick = Math.max(2, 0.55 * u);
  for (let y = 3 * u; y < 21 * u; y += 0.4) {
    const t = ((y - 3 * u) % (period * 2)) / period;      // 0..2 triangle wave
    const off = (t < 1 ? t : 2 - t) * 2 * amp - amp;
    for (let d = -thick / 2; d <= thick / 2; d += 0.4) set(Math.round(cx + off + d), Math.round(y), WHITE);
  }
  return buf;
}

const out = path.join(__dirname, '..', 'public');
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${size}.png`), png(size, size, draw(size)));
  console.log('wrote icon-' + size + '.png');
}
