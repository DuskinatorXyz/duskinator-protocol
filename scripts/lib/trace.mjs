import { readPng, rgba } from './png.mjs';

/* Trace the logo's real pixel grid into closed contours, then fit them into a 32x32 box.
   Steps: opaque png -> luminance mask -> block coverage grid -> marching squares at 0.5 -> Douglas-Peucker. */

export function loadMask(path) {
  const p = readPng(path);
  const lum = (x, y) => { const [r, g, b] = rgba(p, x, y); return (r + g + b) / 3 / 255; };
  let x0 = p.w, y0 = p.h, x1 = 0, y1 = 0;
  for (let y = 0; y < p.h; y += 2) for (let x = 0; x < p.w; x += 2) {
    if (lum(x, y) > 0.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { p, lum, bbox: { x0, y0, x1, y1 }, size: p.w };
}

export function coverageGrid(mask, cell) {
  const { bbox, lum } = mask;
  const pad = 2;
  const cols = Math.ceil((bbox.x1 - bbox.x0 + 1) / cell) + pad * 2;
  const rows = Math.ceil((bbox.y1 - bbox.y0 + 1) / cell) + pad * 2;
  const ox = bbox.x0 - pad * cell;
  const oy = bbox.y0 - pad * cell;
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sum = 0, n = 0;
    for (let y = 0; y < cell; y += 2) for (let x = 0; x < cell; x += 2) {
      const px = ox + c * cell + x, py = oy + r * cell + y;
      if (px < 0 || py < 0 || px >= mask.size || py >= mask.size) continue;
      sum += lum(px, py); n++;
    }
    grid[r * cols + c] = n ? sum / n : 0;
  }
  return { grid, cols, rows, ox, oy, cell };
}

export function contours({ grid, cols, rows }) {
  const v = (c, r) => grid[r * cols + c];
  const segs = [];
  const interp = (a, b) => (0.5 - a) / (b - a);
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const tl = v(c, r), tr = v(c + 1, r), br = v(c + 1, r + 1), bl = v(c, r + 1);
    const idx = (tl > 0.5 ? 8 : 0) | (tr > 0.5 ? 4 : 0) | (br > 0.5 ? 2 : 0) | (bl > 0.5 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = { k: `h${c},${r}`, x: c + interp(tl, tr), y: r };
    const right = { k: `v${c + 1},${r}`, x: c + 1, y: r + interp(tr, br) };
    const bottom = { k: `h${c},${r + 1}`, x: c + interp(bl, br), y: r + 1 };
    const left = { k: `v${c},${r}`, x: c, y: r + interp(tl, bl) };
    const table = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
      5: [[top, left], [bottom, right]], 6: [[top, bottom]], 7: [[top, left]], 8: [[top, left]],
      9: [[top, bottom]], 10: [[top, right], [left, bottom]], 11: [[top, right]], 12: [[left, right]],
      13: [[bottom, right]], 14: [[left, bottom]]
    };
    for (const s of table[idx]) segs.push(s);
  }
  const byKey = new Map();
  segs.forEach((s, i) => { for (const e of s) { if (!byKey.has(e.k)) byKey.set(e.k, []); byKey.get(e.k).push(i); } });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const pts = [segs[i][0], segs[i][1]];
    let tail = segs[i][1];
    for (;;) {
      const next = (byKey.get(tail.k) || []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      const s = segs[next];
      tail = s[0].k === tail.k ? s[1] : s[0];
      pts.push(tail);
    }
    if (pts.length > 8) loops.push(pts.map((p) => [p.x, p.y]));
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

function closedRdp(pts, eps) {
  const ring = pts.slice(0, -1);
  let far = 0, best = 0;
  for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > best) { best = d; far = i; } }
  const a = rdp(ring.slice(0, far + 1), eps);
  const b = rdp([...ring.slice(far), ring[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

export function logoPath(brandPng, { box = 32, margin = 3, cell = 4, eps = 0.03 } = {}) {
  const mask = loadMask(brandPng);
  const g = coverageGrid(mask, cell);
  const loops = contours(g);
  const all = loops.flat();
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const scale = (box - margin * 2) / Math.max(maxX - minX, maxY - minY);
  const offX = (box - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (box - (maxY - minY) * scale) / 2 - minY * scale;
  const f = (n) => (Math.round(n * 100) / 100).toString();
  const d = loops.map((loop) => {
    const pts = loop.map(([x, y]) => [x * scale + offX, y * scale + offY]);
    const simp = closedRdp(pts, eps);
    return 'M' + simp.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
  }).join('');
  return { d, loops: loops.length, grid: `${g.cols}x${g.rows}`, cell, bbox: mask.bbox };
}
