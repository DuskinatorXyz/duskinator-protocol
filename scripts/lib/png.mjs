import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8; let ihdr; const idat = []; let plte = null; let trns = null; const chunks = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos); const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len); chunks.push(type);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], ct: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    if (type === 'PLTE') plte = data;
    if (type === 'tRNS') trns = data;
    pos += 12 + len;
  }
  const { w, h, depth, ct, interlace } = ihdr;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = Math.max(1, (ch * depth) / 8);
  const stride = Math.ceil((w * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c; const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { ihdr, chunks, plte, trns, out, stride, ch, w, h, depth, ct, interlace };
}

export function rgba(p, x, y) {
  const { out, stride, ch, depth, ct, plte, trns } = p;
  const s = depth === 16 ? 2 : 1;
  const o = y * stride + x * ch * s;
  const g = (i) => out[o + i * s];
  if (ct === 6) return [g(0), g(1), g(2), g(3)];
  if (ct === 2) return [g(0), g(1), g(2), 255];
  if (ct === 4) return [g(0), g(0), g(0), g(1)];
  if (ct === 0) return [g(0), g(0), g(0), 255];
  const i = out[o]; return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
}

