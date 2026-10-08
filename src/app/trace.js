import { $, rpcCall, shortKey } from './util.js';
import { isSignatureShaped, normalize } from '/assets/gate.js';

const STORE = 'duskinator_traces_v1';
const POLL_MS = 8000;
const STEPS = ['Landed', 'Confirmed', 'Finalized'];

const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 20))); } catch { /* storage unavailable */ } };

export function startTrace(chain) {
  const form = $('[data-trace-form]');
  if (!form) return;
  const input = $('[data-trace-input]');
  const out = $('[data-trace-out]');
  const err = $('[data-trace-err]');
  let timer = 0; let ticket = 0;

  const call = (method, params) => rpcCall(chain, method, params);

  function showError(msg) { err.hidden = !msg; err.textContent = msg || ''; }

  function renderRecent() {
    const items = load();
    out.replaceChildren();
    if (!items.length) {
      const box = document.createElement('div'); box.className = 'empty-box'; box.textContent = 'Nothing traced yet.'; out.append(box); return;
    }
    const h = document.createElement('div'); h.className = 'faint'; h.style.fontSize = '0.75rem'; h.textContent = 'Recent lookups (this browser)'; out.append(h);
    const wrap = document.createElement('div'); wrap.className = 'recent';
    for (const sig of items) {
      const b = document.createElement('button'); b.type = 'button';
      const s = document.createElement('span'); s.className = 'sig mono'; s.textContent = shortKey(sig);
      b.append(s); b.addEventListener('click', () => { input.value = sig; run(sig); }); wrap.append(b);
    }
    out.append(wrap);
  }

  function renderStatus(sig, st) {
    const level = !st ? -1 : st.confirmationStatus === 'finalized' ? 2 : st.confirmationStatus === 'confirmed' ? 1 : 0;
    const failed = st && st.err;
    out.replaceChildren();
    const card = document.createElement('div'); card.className = 'desk-card';
    const top = document.createElement('div'); top.className = 'leg-top';
    const l = document.createElement('span'); l.textContent = 'Signature';
    const r = document.createElement('span'); r.className = 'mono'; r.textContent = shortKey(sig);
    top.append(l, r);
    const chip = document.createElement('div'); chip.className = 'status-chip'; chip.style.marginTop = '0.9rem';
    const dot = document.createElement('span'); dot.className = 'live-dot'; dot.setAttribute('aria-hidden', 'true');
    chip.append(dot, document.createTextNode(!st ? 'Not seen yet' : failed ? 'Landed with an error' : STEPS[level]));
    card.append(top, chip);

    if (!st) {
      const p = document.createElement('p'); p.className = 'dim'; p.style.cssText = 'margin-top:1rem;font-size:0.875rem'; p.textContent = 'This node has not seen it. It may still be on its way, or the signature may be wrong.'; card.append(p);
    } else {
      const steps = document.createElement('div'); steps.className = 'stepper';
      STEPS.forEach((name, i) => {
        const row = document.createElement('div'); row.className = 'step' + (i < level ? ' done' : i === level ? (level === 2 ? ' done' : ' now') : '');
        const ic = document.createElement('i'); ic.textContent = i < level || (i === level && level === 2) ? '✓' : String(i + 1);
        row.append(ic, document.createTextNode(name)); steps.append(row);
      });
      card.append(steps);
      const kv = document.createElement('div'); kv.className = 'kv';
      const cell = (k, v) => { const c = document.createElement('div'); c.className = 'stat'; c.innerHTML = '<div class="k"></div><div class="v mono"></div>'; c.firstChild.textContent = k; c.lastChild.textContent = v; return c; };
      kv.append(cell('Slot', st.slot.toLocaleString('en-US')), cell('Confirmations', st.confirmations === null ? 'rooted' : String(st.confirmations)));
      if (failed) kv.append(cell('Error', JSON.stringify(st.err).slice(0, 80)));
      card.append(kv);
    }
    out.append(card);
  }

  async function poll(sig, t) {
    try {
      const res = await call('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
      if (t !== ticket) return;
      const st = res.value[0];
      showError('');
      renderStatus(sig, st);
      if (st && st.confirmationStatus === 'finalized') return;
    } catch (e) {
      if (t !== ticket) return;
      showError(`The node did not answer: ${e.message}`);
    }
    timer = setTimeout(() => poll(sig, t), POLL_MS);
  }

  function run(raw) {
    const sig = normalize(raw);
    clearTimeout(timer); const t = ++ticket;
    if (!isSignatureShaped(sig)) {
      showError('Signatures are 64 bytes encoded as 80 to 90 base58 characters. Check what you pasted.');
      return;
    }
    showError('');
    const items = [sig, ...load().filter((s) => s !== sig)]; save(items);
    poll(sig, t);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
  renderRecent();
}
