import { loadMask } from './trace.mjs';

export function parsePolys(d) {
  return d.split('M').filter(Boolean).map((chunk) =>
    chunk.replace('Z', '').split('L').map((p) => p.trim().split(/\s+/).map(Number)));
}

function inside(polys, x, y) {
  let hits = 0;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hits++;
    }
  }
  return hits % 2 === 1;
}

/* Intersection over union between the traced 32-unit path and the brand mask, sampled on a fine grid. */
export function traceIoU(d, brandPng, { box = 32, margin = 3, res = 256 } = {}) {
  const mask = loadMask(brandPng);
  const polys = parsePolys(d);
  const { x0, y0, x1, y1 } = mask.bbox;
  const side = Math.max(x1 - x0, y1 - y0);
  const scale = (box - margin * 2) / side;
  const offX = (box - (x1 - x0) * scale) / 2;
  const offY = (box - (y1 - y0) * scale) / 2;
  let both = 0, either = 0;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const ux = ((i + 0.5) / res) * box, uy = ((j + 0.5) / res) * box;
    const px = Math.round(x0 + (ux - offX) / scale), py = Math.round(y0 + (uy - offY) / scale);
    const inMask = px >= 0 && py >= 0 && px < mask.size && py < mask.size && mask.lum(px, py) > 0.5;
    const inPath = inside(polys, ux, uy);
    if (inMask && inPath) both++;
    if (inMask || inPath) either++;
  }
  return both / either;
}
