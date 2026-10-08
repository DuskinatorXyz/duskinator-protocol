import { $ } from './util.js';
import { fmtChange, fmtPrice, marketsUrl, normalizeMarkets, sparkPath } from '/assets/tape-lib.js';
import { monogram } from './util.js';

const REFRESH_MS = 60000;
const RETRY_MS = 30000;
const SKELETON_ROWS = 8;
const SPARK_W = 96;
const SPARK_H = 28;

export function startTape(reg) {
  const body = $('[data-tape-body]');
  if (!body) return;
  const note = $('[data-tape-note]');
  const rows = [$('[data-fan-track="0"]'), $('[data-fan-track="1"]'), $('[data-fan-track="2"]')];
  let lastOk = 0;
  let items = [];

  function skeleton() {
    body.replaceChildren(...Array.from({ length: SKELETON_ROWS }, () => {
      const tr = document.createElement('tr');
      tr.className = 'is-skeleton';
      tr.innerHTML = '<td><span class="sk sk-name"></span></td><td class="num"><span class="sk sk-price"></span></td><td class="num"><span class="sk sk-chg"></span></td><td class="trend"><span class="sk sk-spark"></span></td>';
      return tr;
    }));
  }

  function icon(item) {
    const wrap = document.createElement('span');
    wrap.className = 'coin';
    wrap.append(monogram(item.symbol));
    return wrap;
  }

  function spark(item) {
    const d = sparkPath(item.spark, SPARK_W, SPARK_H);
    if (!d) return '<span class="faint">n/a</span>';
    const dir = item.spark[item.spark.length - 1] >= item.spark[0] ? 'up' : 'down';
    return `<svg class="spark ${dir}" viewBox="0 0 ${SPARK_W} ${SPARK_H}" width="${SPARK_W}" height="${SPARK_H}" role="img" aria-label="Seven day price line for ${item.name.replace(/"/g, '')}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderTable() {
    body.replaceChildren(...items.map((item) => {
      const tr = document.createElement('tr');
      const c = fmtChange(item.change);
      const name = document.createElement('td');
      const cell = document.createElement('div');
      cell.className = 'tok-cell';
      const text = document.createElement('span');
      text.className = 'tok-text';
      text.innerHTML = '<b></b><i></i>';
      text.firstChild.textContent = item.name;
      text.lastChild.textContent = item.symbol;
      cell.append(icon(item), text);
      name.append(cell);
      tr.append(name);
      tr.insertAdjacentHTML('beforeend', `<td class="num mono">${fmtPrice(item.price)}</td><td class="num mono chg ${c.dir}"><span aria-hidden="true">${c.arrow}</span> ${c.text}<span class="sr-only"> ${c.dir === 'up' ? 'up' : c.dir === 'down' ? 'down' : ''} over 24 hours</span></td><td class="trend">${spark(item)}</td>`);
      return tr;
    }));
  }

  function renderFan() {
    rows.forEach((track, r) => {
      if (!track) return;
      const picks = items.length ? items.filter((_, i) => i % 3 === r || items.length < 6) : [];
      const list = picks.length >= 3 ? picks : items;
      const chips = list.map((item) => {
        const c = fmtChange(item.change);
        return `<span class="fan-chip"><b>${item.symbol}</b><span class="mono ${c.dir}">${c.arrow} ${c.text}</span></span>`;
      }).join('');
      track.innerHTML = chips + chips;
      track.dataset.state = 'live';
    });
  }

  async function pull() {
    try {
      const res = await fetch(marketsUrl(reg.coingeckoApi.value));
      if (res.status === 429) throw new Error('rate limited');
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const fresh = normalizeMarkets(await res.json());
      if (!fresh.length) throw new Error('empty answer');
      items = fresh;
      lastOk = Date.now();
      renderTable();
      renderFan();
      setTimeout(pull, REFRESH_MS);
    } catch (err) {
      note.textContent = items.length
        ? `Price feed paused (${err.message}). Showing the last read, retrying in ${RETRY_MS / 1000}s.`
        : `Price feed unavailable (${err.message}). Retrying in ${RETRY_MS / 1000}s.`;
      setTimeout(pull, RETRY_MS);
    }
  }

  setInterval(() => {
    if (!lastOk) return;
    const age = Math.round((Date.now() - lastOk) / 1000);
    note.textContent = `Market data feed · read ${age}s ago · refreshes every ${REFRESH_MS / 1000}s`;
  }, 1000);

  skeleton();
  pull();
}
