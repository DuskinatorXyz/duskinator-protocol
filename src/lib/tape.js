export const MARKETS_QUERY = {
  vs_currency: 'usd',
  category: 'solana-meme-coins',
  order: 'market_cap_desc',
  per_page: '12',
  page: '1',
  sparkline: 'true',
  price_change_percentage: '24h'
};

export function marketsUrl(base) {
  return `${base}/coins/markets?${new URLSearchParams(MARKETS_QUERY)}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeMarkets(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r.name === 'string' && num(r.current_price) !== null)
    .map((r) => ({
      id: String(r.id),
      name: r.name,
      symbol: String(r.symbol || '').toUpperCase(),
      image: typeof r.image === 'string' ? r.image : '',
      price: r.current_price,
      change: num(r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h),
      spark: Array.isArray(r.sparkline_in_7d?.price) ? r.sparkline_in_7d.price.filter((p) => num(p) !== null) : []
    }));
}

export function fmtPrice(p) {
  if (!(p > 0)) return '$0';
  if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return '$' + p.toFixed(4);
  const decimals = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(p))));
  return '$' + p.toFixed(decimals);
}

export function fmtChange(c) {
  if (c === null) return { arrow: '', text: 'n/a', dir: 'flat' };
  const dir = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
  return { arrow: dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▶', text: `${Math.abs(c).toFixed(2)}%`, dir };
}

export function sparkPath(series, w, h, pad = 2, max = 42) {
  if (series.length < 2) return '';
  const step = Math.max(1, Math.floor(series.length / max));
  const pts = series.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== series[series.length - 1]) pts.push(series[series.length - 1]);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const span = hi - lo || 1;
  return pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - lo) / span) * (h - pad * 2);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
}
