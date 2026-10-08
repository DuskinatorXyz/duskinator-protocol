export const STATES = ['stated', 'absent', 'unconfirmed'];

export function deriveHandle(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length ? parts[0] : null;
  } catch {
    return null;
  }
}

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z';
const GITHUB_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z';

export const SOCIALS = {
  x: { label: 'X', viewBox: '0 0 24 24', path: X_PATH },
  github: { label: 'GitHub', viewBox: '0 0 16 16', path: GITHUB_PATH }
};

export function socialMarkup(key, record) {
  const s = SOCIALS[key];
  const svg = `<svg viewBox="${s.viewBox}" aria-hidden="true" focusable="false" fill="currentColor"><path d="${s.path}"/></svg>`;
  if (record.state === 'stated' && record.url) {
    const handle = deriveHandle(record.url);
    const name = handle ? `${s.label}, @${handle}` : s.label;
    return `<a class="social" data-social="${key}" data-state="stated" href="${esc(record.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}">${svg}</a>`;
  }
  const note = `${s.label}: ${record.state === 'unconfirmed' ? 'not confirmed' : 'not stated'}`;
  return `<span class="social is-inert" data-social="${key}" data-state="${esc(record.state)}" role="img" aria-label="${esc(note)}" title="${esc(note)}">${svg}</span>`;
}

export function caSlotMarkup(record) {
  if (record.state === 'stated' && record.value) {
    return `<button type="button" class="ca-copy" data-ca-copy data-state="stated" data-value="${esc(record.value)}" aria-label="Copy token contract">
        <span class="ca-value">${esc(record.value)}</span>
        <span class="ca-action" data-ca-feedback>Copy</span>
      </button>`;
  }
  return `<div class="ca-copy is-inert" data-ca-copy data-state="${esc(record.state)}" role="group" aria-label="Token contract, ${record.state === 'absent' ? 'not stated' : 'not confirmed'}">
        <span class="ca-value">${record.state === 'absent' ? 'No contract named so far' : 'Contract still unconfirmed'}</span>
        <span class="ca-action">${record.state === 'absent' ? 'nothing to copy yet' : 'waiting for confirmation'}</span>
      </div>`;
}

export function validateRegister(reg) {
  const problems = [];
  for (const [key, rec] of Object.entries(reg.records)) {
    if (!STATES.includes(rec.state)) problems.push(`${key}: bad state ${rec.state}`);
    if (!rec.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(rec.asOf)) problems.push(`${key}: missing asOf date`);
    if (!rec.source) problems.push(`${key}: missing source`);
    if (rec.state !== 'stated') {
      for (const f of ['value', 'url', 'rpc']) {
        if (rec[f]) problems.push(`${key}: ${rec.state} record carries ${f}`);
      }
    }
  }
  return problems;
}
