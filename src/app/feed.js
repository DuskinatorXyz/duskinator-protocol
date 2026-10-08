import { $, fmtInt, rpcCall } from './util.js';

const EPOCH_POLL_MS = 5000;
const PERF_POLL_MS = 20000;

export function startFeed(chain) {
  const slotEl = $('[data-pulse-slot]');
  if (!slotEl) return;
  const els = {
    slot: slotEl,
    slotSub: $('[data-pulse-slot-sub]'),
    height: $('[data-pulse-height]'),
    tps: $('[data-pulse-tps]'),
    tpsSub: $('[data-pulse-tps-sub]'),
    epochK: $('[data-pulse-epoch-k]'),
    epoch: $('[data-pulse-epoch]'),
    bar: $('[data-pulse-bar]'),
    note: $('[data-pulse-note]')
  };
  let lastOk = 0;

  const call = (method, params) => rpcCall(chain, method, params);

  const put = (el, text) => {
    el.classList.remove('is-loading', 'is-offline');
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('num-swap');
    void el.offsetWidth;
    el.classList.add('num-swap');
  };

  function offline(targets, sub, text) {
    for (const el of targets) {
      if (el.classList.contains('is-loading')) { el.textContent = 'Offline'; el.classList.remove('is-loading'); el.classList.add('is-offline'); }
    }
    if (sub.dataset.live !== 'yes') sub.textContent = text;
  }

  async function pollEpoch() {
    try {
      const info = await call('getEpochInfo');
      put(els.slot, fmtInt(info.absoluteSlot));
      els.slotSub.dataset.live = 'yes';
      els.slotSub.textContent = `slot ${fmtInt(info.slotIndex)} of ${fmtInt(info.slotsInEpoch)} in this epoch`;
      put(els.height, fmtInt(info.blockHeight));
      const pct = (info.slotIndex / info.slotsInEpoch) * 100;
      els.epochK.textContent = `Epoch ${info.epoch}`;
      put(els.epoch, `${pct.toFixed(1)}%`);
      els.bar.style.width = `${pct.toFixed(2)}%`;
      lastOk = Date.now();
    } catch (err) {
      els.note.textContent = `Node unreachable (${err.message}). Retrying every ${EPOCH_POLL_MS / 1000}s.`;
      offline([els.slot, els.height, els.epoch], els.slotSub, 'no answer yet, retrying');
    }
  }

  async function pollPerf() {
    try {
      const [sample] = await call('getRecentPerformanceSamples', [1]);
      const tps = sample.numTransactions / sample.samplePeriodSecs;
      put(els.tps, fmtInt(tps));
      els.tpsSub.dataset.live = 'yes';
      els.tpsSub.textContent = `${fmtInt(sample.numNonVoteTransactions / sample.samplePeriodSecs)} non-vote, ${sample.samplePeriodSecs}s window`;
    } catch {
      offline([els.tps], els.tpsSub, 'no answer yet, retrying');
    }
  }

  setInterval(() => {
    if (!lastOk) return;
    const age = Math.round((Date.now() - lastOk) / 1000);
    els.note.textContent = `Public node · updated ${age}s ago · polled every ${EPOCH_POLL_MS / 1000}s`;
  }, 1000);

  pollEpoch();
  pollPerf();
  setInterval(() => { if (!document.hidden) pollEpoch(); }, EPOCH_POLL_MS);
  setInterval(() => { if (!document.hidden) pollPerf(); }, PERF_POLL_MS);
}
