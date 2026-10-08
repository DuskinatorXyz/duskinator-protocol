export function parseTokens(css) {
  const out = {};
  const re = /(--[a-z0-9-]+)\s*:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/g;
  let m;
  while ((m = re.exec(css))) {
    out[m[1]] = { L: Number(m[2]), C: Number(m[3]), H: Number(m[4]), A: m[5] === undefined ? 1 : Number(m[5]) };
  }
  return out;
}

export function grayHex({ L, C }) {
  if (C !== 0) throw new Error('grayHex only converts chroma 0 colours');
  const linear = L ** 3;
  const enc = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  const byte = Math.max(0, Math.min(255, Math.round(enc * 255)));
  const h = byte.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}
