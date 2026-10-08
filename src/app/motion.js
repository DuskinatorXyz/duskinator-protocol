import { $, $$ } from './util.js';
import { pinProgress, ringFill, stepOffset, stepState } from '/assets/steps-lib.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- rotating, typed word in the hero ---------- */
const WORDS = ['sundown.', 'midnight.', 'twilight.', 'the dark.'];
const TYPE_MS = 70;
const ERASE_MS = 38;
const HOLD_MS = 1900;
const GAP_MS = 280;

export function startRotator() {
  const el = $('[data-rot]');
  if (!el) return;
  let w = 0;
  let n = WORDS[0].length;
  let phase = 'hold';
  let timer = 0;

  const draw = () => { el.textContent = WORDS[w].slice(0, n); };
  const tick = () => {
    if (calm()) { el.textContent = WORDS[0]; el.classList.remove('is-typing'); return; }
    el.classList.add('is-typing');
    if (document.hidden) { timer = setTimeout(tick, 500); return; }
    if (phase === 'hold') { phase = 'erase'; timer = setTimeout(tick, HOLD_MS); return; }
    if (phase === 'erase') {
      if (n > 0) { n--; draw(); timer = setTimeout(tick, ERASE_MS); return; }
      w = (w + 1) % WORDS.length; phase = 'type'; timer = setTimeout(tick, GAP_MS); return;
    }
    if (n < WORDS[w].length) { n++; draw(); timer = setTimeout(tick, TYPE_MS); return; }
    phase = 'hold'; timer = setTimeout(tick, 0);
  };
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { clearTimeout(timer); w = 0; n = WORDS[0].length; phase = 'hold'; draw(); tick(); });
  draw();
  tick();
}

/* ---------- scroll-driven reveal ---------- */
const TARGETS = 'section, .grid > *, .stack > *, .desk-card, .field, .chips, .hero > :not(.hero-glow), .tape-wrap, .fan, .foot-in, .foot-meta';
let io = null;

export function startReveal() {
  if (!('IntersectionObserver' in window) || calm()) {
    $$(TARGETS).forEach((el) => el.setAttribute('data-reveal', 'in'));
    document.documentElement.classList.add('reveal-off');
    return;
  }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  const tag = () => {
    $$('[data-view]').forEach((view) => {
      const seen = new Set();
      $$(TARGETS, view).forEach((el) => {
        if (el.hasAttribute('data-reveal') || el.closest('[data-steps]')) return;
        const parent = el.parentElement;
        const i = seen.has(parent) ? [...parent.children].indexOf(el) : 0;
        seen.add(parent);
        el.setAttribute('data-reveal', '');
        el.style.setProperty('--i', String(Math.min(i, 5)));
        io.observe(el);
      });
    });
  };
  tag();
}

/* ---------- sticky scroll tabs with a progress ring ---------- */
export function startSteps() {
  const root = $('[data-steps]');
  if (!root) return;
  const tabs = $$('[data-step]', root);
  const panels = $$('[data-panel]', root);
  const pin = $('.steps-pin', root);
  const rings = tabs.map((t) => $('.ring-fg', t));
  let current = -1;
  let queued = false;

  const stickAt = () => parseFloat(getComputedStyle(pin).top) || 0;

  function paint() {
    queued = false;
    if (!root.offsetParent) return;
    const top = root.getBoundingClientRect().top;
    const p = pinProgress(top, root.offsetHeight, pin.offsetHeight, stickAt());
    const st = stepState(p, tabs.length);
    tabs.forEach((t, i) => {
      const on = i === st.index;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      rings[i].style.strokeDashoffset = String(100 - ringFill(i, st) * 100);
    });
    if (st.index !== current) {
      current = st.index;
      panels.forEach((pn, i) => { pn.classList.toggle('is-on', i === current); pn.setAttribute('aria-hidden', String(i !== current)); });
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      const y = window.scrollY + root.getBoundingClientRect().top - stickAt() + stepOffset(i, tabs.length, root.offsetHeight, pin.offsetHeight);
      window.scrollTo({ top: y, behavior: calm() ? 'auto' : 'smooth' });
    });
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  addEventListener('hashchange', () => setTimeout(queue, 50));
  queue();
}
