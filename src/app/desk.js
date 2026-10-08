import { $, $$, copyText, fmtAmount, fmtUsd, fromRaw, monogram, shortKey, toRaw } from './util.js';

const TYPE_DELAY_MS = 550;
const SEARCH_DELAY_MS = 300;
const REFRESH_SECS = 20;
const SLIPPAGE_BPS = 50;

export function startDesk(reg) {
  const root = $('[data-desk]');
  if (!root) return;
  const quoteApi = reg.quoteApi.value;
  const tokenApi = reg.tokenApi.value;

  const state = {
    mode: 'best',
    from: { id: reg.mintSol.value, symbol: reg.mintSol.symbol, name: 'Solana', decimals: reg.mintSol.decimals, usdPrice: null },
    to: { id: reg.mintUsdc.value, symbol: reg.mintUsdc.symbol, name: 'USD Coin', decimals: reg.mintUsdc.decimals, usdPrice: null },
    amount: '',
    quote: null,
    busy: false,
    error: '',
    nextAt: 0,
    ticket: 0,
    copied: false
  };

  const el = {
    amount: $('[data-amount]', root),
    out: $('[data-out]', root),
    rate: $('[data-rate]', root),
    fromName: $('[data-from-name]', root),
    fromUsd: $('[data-from-usd]', root),
    toUsd: $('[data-to-usd]', root),
    extra: $('[data-quote-extra]', root),
    impact: $('[data-s-impact]', root),
    floor: $('[data-s-floor]', root),
    next: $('[data-s-next]', root),
    routes: $('[data-routes]', root),
    err: $('[data-err]', root),
    cta: $('[data-cta]', root),
    live: $('[data-desk-live]', root),
    pickFrom: $('[data-pick="from"]', root),
    pickTo: $('[data-pick="to"]', root)
  };

  const getJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `the service answered ${res.status}`;
      try { const b = await res.json(); msg = b.error || b.message || msg; } catch { /* keep default */ }
      throw new Error(msg);
    }
    return res.json();
  };

  /* ---------- token side data ---------- */
  async function hydratePrices() {
    try {
      const rows = await getJson(`${tokenApi}/search?query=${state.from.id},${state.to.id}`);
      for (const r of rows) {
        if (r.id === state.from.id) { state.from.usdPrice = r.usdPrice ?? null; state.from.name = r.name || state.from.name; }
        if (r.id === state.to.id) { state.to.usdPrice = r.usdPrice ?? null; state.to.name = r.name || state.to.name; }
      }
    } catch { /* prices are optional */ }
    paint();
  }

  /* ---------- quote ---------- */
  async function fetchQuote() {
    const raw = toRaw(state.amount, state.from.decimals);
    const ticket = ++state.ticket;
    if (!raw || !state.from || !state.to || state.from.id === state.to.id) {
      state.quote = null; state.busy = false; state.error = state.from?.id === state.to?.id && raw ? 'Both sides are the same token.' : '';
      paint();
      return;
    }
    state.busy = true; state.error = ''; paint();
    try {
      const q = new URLSearchParams({
        inputMint: state.from.id,
        outputMint: state.to.id,
        amount: raw.toString(),
        slippageBps: String(SLIPPAGE_BPS),
        onlyDirectRoutes: String(state.mode === 'direct')
      });
      const data = await getJson(`${quoteApi}?${q}`);
      if (ticket !== state.ticket) return;
      state.quote = {
        out: fromRaw(BigInt(data.outAmount), state.to.decimals),
        floor: fromRaw(BigInt(data.otherAmountThreshold), state.to.decimals),
        impact: Number(data.priceImpactPct) * 100,
        hops: (data.routePlan || []).map((leg) => ({ label: leg.swapInfo?.label || 'venue', percent: leg.percent ?? 100 })),
        amountIn: Number(state.amount)
      };
      state.nextAt = Date.now() + REFRESH_SECS * 1000;
    } catch (err) {
      if (ticket !== state.ticket) return;
      state.quote = null;
      state.error = /no routes|could not find|COULD_NOT_FIND/i.test(err.message)
        ? 'Nothing routable for these two tokens at that size. Try other tokens or another amount.'
        : err.message;
    } finally {
      if (ticket === state.ticket) { state.busy = false; paint(); }
    }
  }

  let typeTimer = 0;
  const schedule = () => { clearTimeout(typeTimer); typeTimer = setTimeout(fetchQuote, TYPE_DELAY_MS); };

  /* ---------- paint ---------- */
  function paintPick(btn, tok) {
    btn.replaceChildren();
    if (tok) {
      btn.append(monogram(tok.symbol));
      const s = document.createElement('span'); s.className = 'sym'; s.textContent = tok.symbol; btn.append(s);
    } else {
      const s = document.createElement('span'); s.className = 'empty'; s.textContent = 'Choose one'; btn.append(s);
    }
    btn.insertAdjacentHTML('beforeend', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    btn.setAttribute('aria-label', tok ? `${tok.symbol}, change token` : 'Choose one');
  }

  function paint() {
    paintPick(el.pickFrom, state.from);
    paintPick(el.pickTo, state.to);
    const amt = Number(state.amount);
    el.fromName.textContent = state.from ? state.from.name : 'Pick a token';
    el.fromUsd.textContent = state.from?.usdPrice && amt > 0 ? `≈ ${fmtUsd(amt * state.from.usdPrice)}` : '';

    const q = state.quote;
    if (state.busy && !q) {
      el.out.textContent = '…'; el.out.classList.add('is-empty');
    } else if (q) {
      el.out.textContent = fmtAmount(q.out); el.out.classList.remove('is-empty');
    } else {
      el.out.textContent = '0'; el.out.classList.add('is-empty');
    }
    el.rate.textContent = q && amt > 0 ? `1 ${state.from.symbol} ≈ ${fmtAmount(q.out / amt)} ${state.to.symbol}` : (state.to ? `${state.to.name}` : 'Pick a token');
    el.toUsd.textContent = q && state.to?.usdPrice ? `≈ ${fmtUsd(q.out * state.to.usdPrice)}` : '';
    el.live.hidden = !q;

    el.extra.hidden = !q;
    if (q) {
      el.impact.textContent = `${q.impact < 0.0001 ? '<0.0001' : q.impact.toFixed(4)}%`;
      el.floor.textContent = `${fmtAmount(q.floor)} ${state.to.symbol}`;
      el.routes.replaceChildren(...q.hops.map((h) => {
        const row = document.createElement('div'); row.className = 'hop';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = h.label;
        const bar = document.createElement('span'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = `${h.percent}%`; bar.append(i);
        const pc = document.createElement('span'); pc.className = 'pct mono'; pc.textContent = `${h.percent}%`;
        row.append(nm, bar, pc); return row;
      }));
    }
    paintNext();

    el.err.hidden = !state.error;
    el.err.textContent = state.error;

    let label = 'Copy quote summary'; let enabled = !!q && !state.busy;
    if (!state.from) label = 'Name an input token';
    else if (!(amt > 0)) label = 'Give a size';
    else if (!state.to) label = 'Name an output token';
    else if (state.error) label = 'Nothing quoted; change something and try again';
    else if (state.busy && !q) label = 'Reading the market…';
    else if (state.copied) label = 'Summary copied';
    el.cta.disabled = !enabled;
    el.cta.replaceChildren();
    if (state.busy && !q) { const s = document.createElement('span'); s.className = 'spin'; el.cta.append(s); }
    el.cta.append(document.createTextNode(label));
  }

  function paintNext() {
    if (!state.quote) return;
    el.next.textContent = state.busy ? 'refreshing…' : `${Math.max(0, Math.round((state.nextAt - Date.now()) / 1000))}s`;
  }

  setInterval(() => {
    if (!state.quote || state.busy || document.hidden) { paintNext(); return; }
    if (Date.now() >= state.nextAt) fetchQuote(); else paintNext();
  }, 1000);

  /* ---------- events ---------- */
  el.amount.addEventListener('input', () => {
    el.amount.value = el.amount.value.replace(/[^0-9.]/g, '');
    state.amount = el.amount.value;
    state.copied = false;
    state.busy = true; paint(); schedule();
    if (!Number(state.amount)) { clearTimeout(typeTimer); state.busy = false; state.quote = null; state.error = ''; state.ticket++; paint(); }
  });

  $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    $$('[data-mode]', root).forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    fetchQuote();
  }));

  $('[data-flip]', root).addEventListener('click', () => {
    [state.from, state.to] = [state.to, state.from];
    if (state.quote) { state.amount = String(Number(state.quote.out.toFixed(state.from.decimals))); el.amount.value = state.amount; }
    state.quote = null; fetchQuote();
  });

  el.cta.addEventListener('click', async () => {
    const q = state.quote; if (!q) return;
    const text = `${fmtAmount(q.amountIn)} ${state.from.symbol} -> ~${fmtAmount(q.out)} ${state.to.symbol} (floor ${fmtAmount(q.floor)}), impact ${q.impact.toFixed(4)}%, via ${q.hops.map((h) => `${h.label} ${h.percent}%`).join(', ')}.`;
    if (await copyText(text)) { state.copied = true; paint(); setTimeout(() => { state.copied = false; paint(); }, 1500); }
  });

  /* ---------- picker ---------- */
  const dlg = $('[data-picker]');
  const list = $('[data-picker-list]');
  const search = $('[data-picker-search]');
  let side = 'from'; let pickTicket = 0; let searchTimer = 0;

  async function loadList(term) {
    const t = ++pickTicket;
    list.innerHTML = '<div class="dlg-empty"><span class="spin" style="display:inline-block;vertical-align:middle"></span> Loading tokens…</div>';
    try {
      const url = term ? `${tokenApi}/search?query=${encodeURIComponent(term)}` : `${tokenApi}/toporganicscore/24h?limit=40`;
      const rows = await getJson(url);
      if (t !== pickTicket) return;
      renderList(rows.slice(0, 60), term);
    } catch {
      if (t !== pickTicket) return;
      list.innerHTML = '<div class="dlg-empty">The token index did not answer. Retry shortly.</div>';
    }
  }

  function renderList(rows, term) {
    list.replaceChildren();
    if (!rows.length) { list.innerHTML = '<div class="dlg-empty">No tokens found.</div>'; return; }
    const head = document.createElement('div'); head.className = 'dlg-group'; head.textContent = term ? 'Matches' : 'Most active today'; list.append(head);
    for (const r of rows) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tok';
      const m = document.createElement('div'); m.className = 'm';
      const a = document.createElement('div'); a.className = 'a'; a.textContent = r.symbol;
      const n = document.createElement('div'); n.className = 'b'; n.textContent = `${r.name} · ${shortKey(r.id)}`;
      m.append(a, n);
      const p = document.createElement('div'); p.className = 'p'; p.textContent = r.usdPrice ? (fmtUsd(r.usdPrice) || '') : '';
      b.append(monogram(r.symbol), m, p);
      b.addEventListener('click', () => {
        const tok = { id: r.id, symbol: r.symbol, name: r.name, decimals: r.decimals, usdPrice: r.usdPrice ?? null };
        state[side] = tok; dlg.close(); state.quote = null; state.copied = false; paint(); fetchQuote();
      });
      list.append(b);
    }
  }

  const openPicker = (which) => {
    side = which;
    $('[data-picker-title]').textContent = which === 'from' ? 'Token you pay with' : 'Token you receive';
    search.value = '';
    dlg.showModal();
    loadList('');
    search.focus();
  };
  el.pickFrom.addEventListener('click', () => openPicker('from'));
  el.pickTo.addEventListener('click', () => openPicker('to'));
  $('[data-picker-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadList(search.value.trim()), SEARCH_DELAY_MS); });

  paint();
  hydratePrices();
}
