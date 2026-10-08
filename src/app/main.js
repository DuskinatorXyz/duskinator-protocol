import { $, $$, copyText, readRegister } from './util.js';
import { checkAddress } from '/assets/gate.js';
import { startFeed } from './feed.js';
import { startDesk } from './desk.js';
import { startTrace } from './trace.js';
import { startTape } from './tape.js';
import { startReveal, startRotator, startSteps } from './motion.js';

const reg = readRegister();
const VIEWS = ['home', 'desk', 'trace', 'guide'];
const TITLES = {
  home: 'Duskinator | A read-only price desk for Solana',
  desk: 'Desk | Duskinator',
  trace: 'Trace | Duskinator',
  guide: 'Guide | Duskinator'
};

/* ---------- router ---------- */
function route() {
  const [, view = 'home', section] = location.hash.replace(/^#/, '').split('/');
  const name = VIEWS.includes(view) ? view : 'home';
  $$('[data-view]').forEach((v) => v.classList.toggle('is-on', v.dataset.view === name));
  $$('[data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = TITLES[name];
  const target = section && $(`[data-view="${name}"] [data-anchor="${section}"]`);
  if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

/* ---------- contract slot ---------- */
const slot = $('[data-ca-copy]');
const live = $('[data-ca-live]');
if (slot && slot.tagName === 'BUTTON') {
  const fb = $('[data-ca-feedback]', slot);
  let timer = 0;
  slot.addEventListener('click', async () => {
    const ok = await copyText(slot.dataset.value);
    fb.textContent = ok ? 'Copied' : 'Copy failed, select the text';
    live.textContent = ok ? 'Token contract copied' : 'Copy failed';
    clearTimeout(timer);
    timer = setTimeout(() => { fb.textContent = 'Copy'; live.textContent = ''; }, 1600);
  });
}

/* ---------- address check ---------- */
const form = $('[data-check-form]');
const outBox = $('[data-check-out]');
const checkInput = $('[data-check-input]');
const MESSAGES = {
  empty: () => 'Waiting for input.',
  'not-address': () => 'Not shaped like a Solana address. Addresses use 32 to 44 base58 characters and decode to exactly 32 bytes.',
  unstated: (r) => `Nothing has been ${r.state === 'unconfirmed' ? 'confirmed' : 'named'} as this project\'s contract. With no reference point, treat any string presented as ours as unverified.`,
  match: () => 'Identical, character for character, versus the named contract.',
  mismatch: () => 'Well-formed address, yet different from the named contract.'
};
function runCheck() {
  const r = checkAddress(checkInput.value, reg.ca);
  const text = MESSAGES[r.verdict](r);
  outBox.dataset.verdict = r.verdict;
  outBox.textContent = text;
}
form.addEventListener('submit', (e) => { e.preventDefault(); runCheck(); });
checkInput.addEventListener('input', runCheck);

startFeed(reg.chain);
startDesk(reg);
startTrace(reg.chain);
startTape(reg);
startRotator();
startReveal();
startSteps();
