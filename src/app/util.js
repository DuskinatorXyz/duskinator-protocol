export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function readRegister() {
  return JSON.parse(document.getElementById('register').textContent).records;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function fmtInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';
}

export function fmtAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function fmtUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 0.01) return '$' + n.toPrecision(2);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortKey(key) {
  return key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
}

export function monogram(symbol) {
  const t = document.createElement('span');
  t.className = 'mono-tile';
  t.setAttribute('aria-hidden', 'true');
  t.textContent = String(symbol || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';
  return t;
}

export function toRaw(amountText, decimals) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(amountText.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const whole = m[1] || '0';
  const frac = (m[2] || '').slice(0, decimals).padEnd(decimals, '0');
  const raw = BigInt(whole + frac);
  return raw > 0n ? raw : null;
}

export function fromRaw(raw, decimals) {
  return Number(raw) / 10 ** decimals;
}

export async function rpcCall(chain, method, params = []) {
  const res = await fetch(chain.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error('node answered ' + res.status);
  const out = await res.json();
  if (out.error) throw new Error(out.error.message);
  return out.result;
}
