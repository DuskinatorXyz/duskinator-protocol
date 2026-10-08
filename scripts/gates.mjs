import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as gate from '../src/lib/gate.js';
import * as regLib from '../src/lib/register.js';
import { grayHex, parseTokens } from './lib/tokens.mjs';
import { readPng, rgba } from './lib/png.mjs';
import { traceIoU } from './lib/raster.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
function must(cond, msg) { if (!cond) throw new Error(msg); }

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('dist/index.html missing. Run npm run build first.');
  process.exit(1);
}

const register = JSON.parse(rd('src/register.json'));
const rec = register.records;
const html = rd('dist/index.html');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const rel = (p) => relative(root, p).replace(/\\/g, '/');

/* ------------------------------------------------------------------ 1 register */
check('register: every record has a legal state, a date and a source', () => {
  const problems = regLib.validateRegister(register);
  must(problems.length === 0, problems.join('; '));
  return `${Object.keys(rec).length} records`;
});

check('register: unstated records carry no value and no url', () => {
  for (const [k, r] of Object.entries(rec)) {
    if (r.state !== 'stated') must(!r.value && !r.url && !r.rpc, `${k} leaks a value`);
  }
  must(!JSON.stringify(register).includes('"handle"'), 'a handle is stored; it must be derived from the url');
});

/* ------------------------------------------------------------------ 2 palette */
const tokensCss = rd('src/tokens.css');
const colourLiteral = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(|(?<!--)\b(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|cyan|magenta|transparent|navy|teal|lime|maroon|olive|aqua)\b(?=\s*[;,)}])/i;

const brandPng = 'brand/LOGO DUSKINATOR PNG.png';
const lightL = (v) => { const c = v / 255; const lin = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; return Math.cbrt(lin); };

check('palette: brand pixels are measured again and match palette.json and tokens.css', () => {
  const p = readPng(join(root, brandPng));
  const hist = new Map();
  let spreadOpaque = 0;
  for (let y = 0; y < p.h; y += 2) for (let x = 0; x < p.w; x += 2) {
    const [r, gg, bb, al] = rgba(p, x, y);
    hist.set(`${r},${gg},${bb}`, (hist.get(`${r},${gg},${bb}`) || 0) + 1);
    if (al === 255) spreadOpaque = Math.max(spreadOpaque, Math.max(r, gg, bb) - Math.min(r, gg, bb));
  }
  const ranked = [...hist.entries()].sort((m, n) => n[1] - m[1]);
  must(ranked[0][0] === '0,0,0', 'dominant brand pixel is not pure black');
  const lightest = ranked.find(([k]) => { const [r, gg, bb] = k.split(',').map(Number); return r > 200 && r === gg && gg === bb; });
  must(lightest, 'no near-white achromatic pixel found');
  const white = Number(lightest[0].split(',')[0]);
  const pal = JSON.parse(rd('src/palette.json')).colours;
  must(pal.black.srgb.join() === '0,0,0' && pal.white.srgb.join() === `${white},${white},${white}`, 'palette.json disagrees with the brand pixels');
  const L = Number(/--white:\s*oklch\(([\d.]+) 0 0\)/.exec(tokensCss)?.[1]);
  must(Math.abs(L - lightL(white)) < 1e-5, `--white L ${L} differs from measured ${lightL(white).toFixed(6)}`);
  must(/--black:\s*oklch\(0 0 0\)/.test(tokensCss), '--black is not the measured black');
  return `black 0,0,0 and white ${white},${white},${white}; opaque channel spread ${spreadOpaque}`;
});

check('palette: tokens.css holds three literals only (black, white, clear), chroma exactly 0, mixes use vars only', () => {
  const calls = tokensCss.match(/oklch\([^)]*\)/g) || [];
  must(calls.length === 3, `expected 3 oklch literals, found ${calls.length}`);
  for (const c of calls) {
    const parts = c.slice(6, -1).split('/')[0].trim().split(/\s+/);
    must(parts.length === 3 && parts[1] === '0' && parts[2] === '0', `chroma/hue not literally 0 in ${c}`);
  }
  const stripped = tokensCss
    .replace(/oklch\([^)]*\)/g, '')
    .replace(/color-mix\(in oklch, var\(--[a-z0-9-]+\) [\d.]+%, var\(--[a-z0-9-]+\)\)/g, '')
    .replace(/var\(--[a-z0-9-]+\)/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  must(!colourLiteral.test(stripped), 'colour literal other than the three, or a mix with a non-var argument');
  const mixes = (tokensCss.match(/color-mix\(/g) || []).length;
  return `3 literals, ${mixes} derived mixes`;
});

check('palette: no colour literal outside tokens.css (src)', () => {
  const files = walk(join(root, 'src')).filter((p) => !['src/tokens.css', 'src/palette.json'].includes(rel(p)) && /\.(css|html|js|json)$/.test(p));
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8').replace(/url\("data:image\/svg\+xml[^"]*"\)/g, '');
    if (colourLiteral.test(text)) bad.push(rel(f));
  }
  must(bad.length === 0, `literals in ${bad.join(', ')}`);
  return `${files.length} files`;
});

check('palette: dist css is tokens + var() only', () => {
  const css = rd('dist/assets/app.css');
  const cut = css.indexOf('*, *::before');
  must(cut > 0, 'cannot split tokens from rules');
  const rules = css.slice(cut).replace(/url\("data:image\/svg\+xml[^"]*"\)/g, '');
  must(!colourLiteral.test(rules), 'literal in dist rules');
  must(!/\d(?:\.\d+)?ch\b/.test(css), 'ch unit found');
});

check('palette: favicon, manifest and theme-color use only the two brand values', () => {
  const tokens = parseTokens(tokensCss);
  const black = grayHex(tokens['--black']);
  const white = grayHex(tokens['--white']);
  const fav = rd('dist/favicon.svg');
  const hexes = [...new Set(fav.match(/#[0-9a-f]{6}/gi) || [])];
  must(hexes.length === 2 && hexes.includes(black) && hexes.includes(white), `favicon colours ${hexes} are not exactly ${black} and ${white}`);
  must(html.includes(`content="${black}"`), 'theme-color is not the black token');
  must(JSON.parse(rd('dist/manifest.webmanifest')).theme_color === black, 'manifest theme color differs');
});

check('no ch units anywhere in src or dist', () => {
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'dist'))].filter((p) => /\.(css|html|js)$/.test(p));
  for (const f of files) must(!/\d(?:\.\d+)?ch\b/.test(readFileSync(f, 'utf8')), `ch unit in ${rel(f)}`);
  return `${files.length} files`;
});

/* ------------------------------------------------------------------ 3 favicon */
check('favicon: traced from the brand pixel grid (coverage agrees with the png mask)', () => {
  const fav = rd('dist/favicon.svg');
  const d = /<path[^>]* d="([^"]+)"/.exec(fav)?.[1];
  must(d && d.startsWith('M'), 'no traced path');
  const iou = traceIoU(d, join(root, brandPng));
  must(iou >= 0.97, `trace overlap ${iou.toFixed(4)} is below 0.97`);
  must(!/<(rect|circle|ellipse)[^>]*fill="#(?!000000)/.test(fav), 'invented shapes in the favicon');
  return `IoU ${iou.toFixed(4)} over a 256 grid`;
});

check('favicon: svg 32x32, no comments, no double hyphen inside', () => {
  const fav = rd('dist/favicon.svg');
  must(/width="32"/.test(fav) && /height="32"/.test(fav) && /viewBox="0 0 32 32"/.test(fav), 'not 32x32');
  must(!fav.includes('<!--') && !fav.includes('-->'), 'xml comment present');
  must(!fav.includes('--'), 'double hyphen present');
  must(html.includes('rel="icon" type="image/svg+xml"'), 'icon link missing');
});

/* ------------------------------------------------------------------ 4 repo hygiene */
check('hygiene: no agent memory file, no agent config dir, no AI attribution strings', () => {
  const all = walk(root);
  const names = all.map(rel);
  const frag = (...p) => p.join('');
  must(!names.some((n) => new RegExp('(^|/)' + frag('cla', 'ude') + '\\.md$', 'i').test(n)), 'agent memory file present');
  must(!names.some((n) => new RegExp('(^|/)\\.' + frag('cla', 'ude') + '/').test(n)), 'agent config dir present');
  const bad = new RegExp([
    frag('co-', 'authored-by'), frag('generated ', '(?:with|by)'), frag('cla', 'ude'), frag('anthr', 'opic'),
    frag('chat', 'gpt'), frag('open', 'ai'), frag('copi', 'lot'), '\\bAI[- ]generated\\b'
  ].join('|'), 'i');
  const hits = all.filter((p) => /\.(css|html|js|mjs|json|md|txt|svg|webmanifest)$/.test(p) || p.endsWith('_headers'))
    .filter((p) => bad.test(readFileSync(p, 'utf8'))).map(rel);
  must(hits.length === 0, `attribution strings in ${hits.join(', ')}`);
  return `${all.length} files scanned`;
});

check('hygiene: nothing from the reference leaks (name, ca, handle, host)', () => {
  const frag = (...p) => p.join('');
  const bad = new RegExp([frag('dark', 'inator'), frag('dark', 'swap'), frag('poly', 'mator'), '8YRg8bji', frag('near ', 'intents')].join('|'), 'i');
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'dist'))].filter((p) => /\.(css|html|js|json|svg|webmanifest|txt)$/.test(p));
  const hits = files.filter((p) => bad.test(readFileSync(p, 'utf8'))).map(rel);
  must(hits.length === 0, `reference strings in ${hits.join(', ')}`);
});

/* ------------------------------------------------------------------ 5 dist wiring: CA slot */
check('dist: ca slot sits above main, renders the current record state', () => {
  const caAt = html.indexOf('data-ca-slot');
  must(caAt > html.indexOf('</header>') && caAt < html.indexOf('<main'), 'ca slot is not the first block after the header');
  const m = /<(button|div)[^>]*data-ca-copy[^>]*>/.exec(html);
  must(m, 'ca element missing');
  const tag = m[0];
  must(tag.includes(`data-state="${rec.ca.state}"`), 'ca data-state differs from register');
  if (rec.ca.state === 'stated') {
    must(m[1] === 'button' && tag.includes(`data-value="${rec.ca.value}"`), 'stated ca is not a live copy button');
    must(html.includes(`<span class="ca-value">${rec.ca.value}</span>`), 'full address not rendered');
    return 'branch: stated (live copy button)';
  }
  must(m[1] === 'div' && !tag.includes('data-value') && !/<button[^>]*data-ca-copy/.test(html), 'unstated ca is interactive');
  must(/not (stated|confirmed)|No contract named|still unconfirmed/.test(html), 'inert slot does not say its state in words');
  return `branch: ${rec.ca.state} (inert, stated in words, no date)`;
});

check('dist: ca slot css is large type, full address allowed to wrap', () => {
  const css = rd('dist/assets/app.css');
  const v = /\.ca-value\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(css);
  must(v && Number(v[1]) >= 1.1, 'ca font too small on mobile');
  const blocks = [...css.matchAll(/@media \(min-width: 48em\)\s*\{([^@]*?)\n\}/g)].map((m) => m[1]);
  const d = blocks.map((b) => /\.ca-value\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(b)).find(Boolean);
  must(d && Number(d[1]) >= 1.5, 'ca font too small on desktop');
  must(/overflow-wrap:\s*anywhere/.test(css), 'ca can overflow');
});

/* ------------------------------------------------------------------ 6 dist wiring: socials */
check('dist: both social icons present, icon-only, rendered per record state', () => {
  const block = /<div class="socials"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  must(block, 'socials block missing');
  const inner = block[1];
  for (const key of ['x', 'github']) {
    const m = new RegExp(`<(a|span)[^>]*data-social="${key}"[^>]*>`).exec(inner);
    must(m, `${key} icon missing`);
    const r = rec[key];
    if (r.state === 'stated' && r.url) {
      must(m[1] === 'a' && m[0].includes(`href="${r.url}"`), `${key} stated but not linked to its stored url`);
    } else {
      must(m[1] === 'span' && !/href/.test(m[0]), `${key} unstated but carries an href`);
      must(/not (stated|confirmed)/.test(m[0]), `${key} inert icon does not say its state`);
    }
  }
  must(!/href/.test(inner.replace(/<a[^>]*data-social[^>]*href="[^"]*"[^>]*>/g, '')), 'stray href in socials');
  const text = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  must(text === '', `text label inside socials: "${text}"`);
  must((inner.match(/<svg/g) || []).length === 2, 'expected exactly two svg icons');
  const css = rd('dist/assets/app.css');
  must(!/\.socials?[^{]*\{[^}]*display:\s*none/.test(css), 'socials hidden at some breakpoint');
  return `x=${rec.x.state}, github=${rec.github.state}`;
});

check('link rule: both branches render correctly from fixtures built off the live records', () => {
  for (const key of ['x', 'github']) {
    const stated = regLib.socialMarkup(key, { ...rec[key], state: 'stated', url: `https://example.org/some_handle` });
    must(/^<a /.test(stated) && stated.includes('href="https://example.org/some_handle"'), `${key}: stated has no link`);
    must(stated.includes('@some_handle'), `${key}: handle not derived from url`);
    must(stated.includes('rel="noopener noreferrer"'), `${key}: missing rel`);
    for (const state of ['absent', 'unconfirmed']) {
      const inert = regLib.socialMarkup(key, { ...rec[key], state, url: null });
      must(/^<span /.test(inert) && !/href/.test(inert), `${key}: ${state} carries an href`);
      must(/not (stated|confirmed)/.test(inert) && !/\d{4}/.test(inert), `${key}: ${state} must say its state and carry no date`);
    }
    must(!regLib.socialMarkup(key, { ...rec[key], state: 'stated', url: null }).includes('href'), `${key}: stated-without-url must stay inert`);
  }
  must(regLib.deriveHandle('https://x.com/abc/status/1') === 'abc', 'handle derivation');
  must(regLib.deriveHandle('not a url') === null, 'bad url should give null');
});

/* ------------------------------------------------------------------ 7 gate functional suite */
const FIX_A = 'So11111111111111111111111111111111111111112';
const FIX_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function nearTwin(g, addr) {
  for (let i = 0; i < ALPHA.length; i++) {
    const t = addr.slice(0, -1) + ALPHA[i];
    if (t !== addr && g.isAddressShaped(t)) return t;
  }
  return null;
}

function suite(g) {
  const cur = rec.ca;
  const stated = { ...cur, state: 'stated', value: FIX_A };
  const absent = { ...cur, state: 'absent', value: null };
  const unconfirmed = { ...cur, state: 'unconfirmed', value: null };
  const v = (input, r) => g.checkAddress(input, r).verdict;
  const is = (got, want, label) => must(got === want, `${label}: got ${got}, wanted ${want}`);

  is(v(FIX_A, stated), 'match', 'stated exact');
  is(v(FIX_B, stated), 'mismatch', 'stated, other valid address (base58 must not be blanket-rejected)');
  const twin = nearTwin(g, FIX_A);
  must(twin, 'could not build a lookalike');
  is(v(twin, stated), 'mismatch', 'stated, one-character lookalike');
  is(v(`  ${FIX_A}​ `, stated), 'match', 'stated, padded with space and zero-width');
  is(v(FIX_A, absent), 'unstated', 'absent record, valid address');
  is(v(FIX_B, unconfirmed), 'unstated', 'unconfirmed record, valid address');
  is(v('', stated), 'empty', 'empty input');
  is(v('   ', absent), 'empty', 'blank input');
  is(v('hello world', stated), 'not-address', 'plain words, stated');
  is(v('hello world', absent), 'not-address', 'plain words, absent');
  is(v(FIX_A.slice(1), stated), 'not-address', 'too short');
  is(v('0' + FIX_A, stated), 'not-address', 'zero is outside base58');
  const long44 = 'z'.repeat(44);
  must(g.hasAddressShape(long44), 'fixture 44 should have address shape');
  is(v(long44, stated), 'not-address', '44 chars that do not decode to 32 bytes');
  is(v(FIX_A, { ...stated, value: '' }), 'unstated', 'stated record with empty value');
  must(g.isSignatureShaped('1'.repeat(64)) === false, 'ones are not a 64-byte signature of that length');
  return true;
}

check('gate: functional suite passes against the real module', () => suite(gate));

check('gate: both branches of the live record, plus the other one by fixture', () => {
  const live = gate.checkAddress(FIX_A, rec.ca).verdict;
  const expectLive = rec.ca.state === 'stated' ? (rec.ca.value === FIX_A ? 'match' : 'mismatch') : 'unstated';
  must(live === expectLive, `live record gave ${live}, expected ${expectLive}`);
  const other = { ...rec.ca, state: rec.ca.state === 'stated' ? 'absent' : 'stated', value: rec.ca.state === 'stated' ? null : FIX_A };
  const o = gate.checkAddress(FIX_A, other).verdict;
  must(o === (rec.ca.state === 'stated' ? 'unstated' : 'match'), `opposite branch gave ${o}`);
  return `live record: ${rec.ca.state} -> ${live}; opposite branch -> ${o}`;
});

/* ------------------------------------------------------------------ 8 mutation harness */
async function load(source) {
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + `#${Math.random()}`);
}

const gateSrc = rd('src/lib/gate.js');
const regSrc = rd('src/lib/register.js');

const GATE_MUTATIONS = [
  ['sameAddress always true', /(export const sameAddress = \(a, b\) =>)[^;]+;/, '$1 true;'],
  ['sameAddress always false', /(export const sameAddress = \(a, b\) =>)[^;]+;/, '$1 false;'],
  ['isStated always true', /(export const isStated = \(record\) =>)[^;]+;/, '$1 true;'],
  ['isStated always false', /(export const isStated = \(record\) =>)[^;]+;/, '$1 false;'],
  ['hasAddressShape rejects everything', /(export const hasAddressShape = \(text\) =>)[^;]+;/, '$1 false;'],
  /* "hasAddressShape accepts everything" is an equivalent mutant: every 32-byte value already
     encodes to 32..44 characters, so decodesTo32 alone enforces the same set. It is omitted on purpose. */
  ['decodesTo32 rejects everything', /(export const decodesTo32 = \(text\) =>)[^;]+;/, '$1 false;'],
  ['decodesTo32 accepts everything', /(export const decodesTo32 = \(text\) =>)[^;]+;/, '$1 true;'],
  ['normalize keeps padding', /(export const normalize = \(input\) =>)[\s\S]*?;\n/, "$1 String(input ?? '');\n"],
  ['shape check removed from checkAddress', /^\s*if \(!isAddressShaped\(text\)\)[^\n]*\n/m, ''],
  ['unstated reported as mismatch', /verdict: 'unstated'/, "verdict: 'mismatch'"],
  ['match reported as mismatch', /\? 'match' : 'mismatch'/, "? 'mismatch' : 'match'"],
  ['blanket base58 reject inserted', /(if \(!text\) return \{ verdict: 'empty' \};\n)/, "$1  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(text)) return { verdict: 'not-address' };\n"]
];

const REG_MUTATIONS = [
  ['social link gate always open', /if \(record\.state === 'stated' && record\.url\)/, 'if (true)'],
  ['handle returns the whole url', /return parts\.length \? parts\[0\] : null;/, 'return url;'],
  ['inert icon given an href', /<span class="social is-inert"/, '<a href="#" class="social is-inert"'],
  ['ca slot gate always open', /if \(record\.state === 'stated' && record\.value\)/, 'if (true)']
];

function regSuite(r) {
  for (const key of ['x', 'github']) {
    const stated = r.socialMarkup(key, { ...rec[key], state: 'stated', url: 'https://example.org/some_handle' });
    must(/^<a /.test(stated) && stated.includes('@some_handle'), 'stated social');
    const inert = r.socialMarkup(key, { ...rec[key], state: 'absent', url: null });
    must(/^<span /.test(inert) && !/href/.test(inert), 'inert social');
  }
  const caInert = r.caSlotMarkup({ ...rec.ca, state: 'absent', value: null });
  must(!/<button/.test(caInert) && !/data-value/.test(caInert), 'inert ca');
  const caLive = r.caSlotMarkup({ ...rec.ca, state: 'stated', value: FIX_A });
  must(/<button/.test(caLive) && caLive.includes(FIX_A), 'live ca');
}

let mutationReport = '';
const mutationChecks = (async () => {
  let killed = 0; const survivors = [];
  const base = await load(gateSrc);
  suite(base);
  const regBase = await load(regSrc);
  regSuite(regBase);
  for (const [name, re, to] of GATE_MUTATIONS) {
    must(re.test(gateSrc), `anchor missing for "${name}"`);
    let dead = false;
    try { suite(await load(gateSrc.replace(re, to))); } catch { dead = true; }
    dead ? killed++ : survivors.push(name);
  }
  for (const [name, re, to] of REG_MUTATIONS) {
    must(re.test(regSrc), `anchor missing for "${name}"`);
    let dead = false;
    try { regSuite(await load(regSrc.replace(re, to))); } catch { dead = true; }
    dead ? killed++ : survivors.push(name);
  }
  const total = GATE_MUTATIONS.length + REG_MUTATIONS.length;
  must(survivors.length === 0, `survived: ${survivors.join('; ')}`);
  mutationReport = `${killed}/${total} mutants killed; baseline green`;
  return mutationReport;
})();

try {
  const detail = await mutationChecks;
  results.push({ name: 'mutation harness: anchors read from structure, fixtures from the live record', ok: true, detail });
} catch (e) {
  results.push({ name: 'mutation harness: anchors read from structure, fixtures from the live record', ok: false, detail: e.message });
}

/* ------------------------------------------------------------------ 9 motion + structure */
check('motion: prefers-reduced-motion disables animation and transition', () => {
  const css = rd('dist/assets/app.css');
  const m = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
  must(m, 'no reduced-motion block');
  must(/animation:\s*none/.test(m[1]) && /transition:\s*none/.test(m[1]), 'block does not zero both');
});

check('dist: every local reference resolves to a file', () => {
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].map((m) => m[1]);
  for (const r of refs) must(existsSync(join(root, 'dist', r.replace(/^\//, ''))), `missing ${r}`);
  for (const f of readdirSync(join(root, 'dist', 'assets')).filter((n) => n.endsWith('.js'))) {
    const text = rd(`dist/assets/${f}`);
    for (const m of text.matchAll(/from '(\/[^']+)'/g)) must(existsSync(join(root, 'dist', m[1].slice(1))), `missing ${m[1]} imported by ${f}`);
    for (const m of text.matchAll(/from '(\.\/[^']+)'/g)) must(existsSync(join(root, 'dist', 'assets', m[1].slice(2))), `missing ${m[1]} imported by ${f}`);
  }
  return `${refs.length} refs`;
});

check('dist: nothing outside dist is needed to deploy (no source maps, no node_modules)', () => {
  const files = walk(join(root, 'dist')).map(rel);
  must(!files.some((f) => /\.map$|node_modules/.test(f)), 'stray files in dist');
  return `${files.length} files`;
});

/* ------------------------------------------------------------------ 9b stated branch, built end to end */
check('dist (fixture build): stated records flip the ca to a live copy button and socials to real links', () => {
  const tmp = join(root, '.tmp-gates');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const fx = JSON.parse(JSON.stringify(register));
    fx.records.ca = { ...fx.records.ca, state: 'stated', value: FIX_A };
    fx.records.x = { ...fx.records.x, state: 'stated', url: 'https://x.com/fixture_handle' };
    fx.records.github = { ...fx.records.github, state: 'stated', url: 'https://github.com/fixture-org' };
    writeFileSync(join(tmp, 'register.json'), JSON.stringify(fx));
    execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], {
      env: { ...process.env, DIST_DIR: join(tmp, 'dist'), REGISTER_FILE: join(tmp, 'register.json') },
      stdio: 'pipe'
    });
    const h = readFileSync(join(tmp, 'dist', 'index.html'), 'utf8');
    const ca = /<(button|div)[^>]*data-ca-copy[^>]*>/.exec(h);
    must(ca && ca[1] === 'button' && ca[0].includes(`data-value="${FIX_A}"`), 'stated ca is not a copy button');
    must(h.includes(`<span class="ca-value">${FIX_A}</span>`), 'full address missing from the slot');
    must(/<a [^>]*data-social="x"[^>]*href="https:\/\/x\.com\/fixture_handle"/.test(h), 'x link missing');
    must(h.includes('aria-label="X, @fixture_handle"'), 'x handle not derived from the stored url');
    must(/<a [^>]*data-social="github"[^>]*href="https:\/\/github\.com\/fixture-org"/.test(h), 'github link missing');
    must(h.includes('aria-label="GitHub, @fixture-org"'), 'github handle not derived from the stored url');
    return 'branch: stated (fixture build, removed afterwards)';
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ 9c feeds, tape, motion */
const tapeLib = await import(pathToFileURL(join(root, 'src', 'lib', 'tape.js')).href);
const stepsLib = await import(pathToFileURL(join(root, 'src', 'lib', 'steps.js')).href);

function tapeSuite(t) {
  const rows = t.normalizeMarkets([
    { id: 'a', name: 'Alpha', symbol: 'alp', image: 'https://x.test/a.png', current_price: 0.0000034, price_change_percentage_24h_in_currency: -2.5, sparkline_in_7d: { price: [1, 2, 3, 2, 4] } },
    { id: 'b', name: 'Beta', symbol: 'bet', current_price: 12.5, price_change_percentage_24h: null, sparkline_in_7d: { price: [] } },
    { id: 'c', name: 'Broken', symbol: 'brk', current_price: null },
    null
  ]);
  must(rows.length === 2, 'rows without a price must be dropped');
  must(rows[0].symbol === 'ALP' && rows[0].change === -2.5 && rows[0].spark.length === 5, 'row fields');
  must(rows[1].change === null && rows[1].image === '', 'missing change and image must stay explicit');
  must(t.fmtPrice(12.5) === '$12.50', 'price >= 1');
  must(t.fmtPrice(0.5) === '$0.5000', 'price >= 0.01');
  must(/^\$0\.0000034/.test(t.fmtPrice(0.0000034)), `tiny price kept its digits: ${t.fmtPrice(0.0000034)}`);
  must(t.fmtChange(1.234).dir === 'up' && t.fmtChange(-1.234).text === '1.23%' && t.fmtChange(null).text === 'n/a', 'change formatting');
  const d = t.sparkPath([1, 5, 3], 100, 20);
  must(d.startsWith('M2.0 18.0') && d.includes('L98.0 2.0') === false, `spark start ${d}`);
  must(t.sparkPath([1], 100, 20) === '', 'one point has no line');
  const url = t.marketsUrl('https://api.test/v3');
  must(url.includes('sparkline=true') && url.includes('category=solana-meme-coins') && url.includes('price_change_percentage=24h'), 'markets url asks for sparklines and 24h change');
}

function stepsSuite(s) {
  must(s.stepState(0, 3).index === 0 && s.stepState(0, 3).fill === 0, 'p=0');
  const mid = s.stepState(0.5, 3);
  must(mid.index === 1 && Math.abs(mid.fill - 0.5) < 1e-9, 'p=0.5 sits half way through step 2');
  const end = s.stepState(1, 3);
  must(end.index === 2 && end.fill === 1, 'p=1 ends on a full last ring');
  must(s.stepState(-4, 3).index === 0 && s.stepState(9, 3).index === 2, 'progress is clamped');
  must(s.ringFill(0, mid) === 1 && s.ringFill(1, mid) === mid.fill && s.ringFill(2, mid) === 0, 'earlier rings full, later rings empty');
  must(s.pinProgress(96, 2000, 400, 96) === 0, 'at the pin line progress is 0');
  must(s.pinProgress(96 - 1600, 2000, 400, 96) === 1, 'after the full travel progress is 1');
  must(Math.abs(s.pinProgress(96 - 800, 2000, 400, 96) - 0.5) < 1e-9, 'half travel is 0.5');
  must(s.pinProgress(0, 300, 400, 96) === 0, 'a section shorter than the pin never divides by zero');
  must(s.pinProgress(0, 400, 400, 96) === 0, 'a section exactly as tall as the pin has no travel');
  must(s.pinProgress(900, 2000, 400, 96) === 0, 'below the pin line progress stays at 0');
  must(s.pinProgress(-9000, 2000, 400, 96) === 1, 'far past the end progress stays at 1');
  for (let i = 0; i < 3; i++) must(s.stepState(s.stepOffset(i, 3, 2000, 400) / 1600, 3).index === i, `tab ${i} lands inside its own step`);
}

check('tape: markets rows are normalised, formatted and drawn as lines from live-shaped data', () => { tapeSuite(tapeLib); });
check('steps: ring and step state follow scroll progress, clamped, tabs land in their own step', () => { stepsSuite(stepsLib); });

check('tape/steps mutation harness: structural anchors, all mutants killed', async () => {});
{
  const tapeSrc = rd('src/lib/tape.js');
  const stepsSrc = rd('src/lib/steps.js');
  const T = [
    ['rows without price kept', "num(r.current_price) !== null)", 'true)'],
    ['change sign flipped', "const dir = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';", "const dir = c > 0 ? 'down' : c < 0 ? 'up' : 'flat';"],
    ['tiny prices rounded to cents', "const decimals = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(p))));", 'const decimals = 2;'],
    ['sparklines dropped from the query', "sparkline: 'true',", "sparkline: 'false',"],
    ['spark y axis not inverted', "(1 - (v - lo) / span)", "((v - lo) / span)"]
  ];
  const S = [
    ['step index never advances', "Math.min(count - 1, Math.floor(q))", '0'],
    ['later rings fill early', "if (i < state.index) return 1;", "if (i <= state.index + 1) return 1;"],
    ['progress not clamped', "return clamp((stickAt - top) / travel, 0, 1);", "return (stickAt - top) / travel;"],
    ['short section divides by zero', "if (travel <= 0) return 0;", ''],
    ['tab offset ignores its step', "((i + 0.04) / count) * travel", "(0.04 / count) * travel"]
  ];
  let killed = 0; const alive = [];
  const run = async (src, list, suiteFn) => {
    for (const [name, from, to] of list) {
      must(src.includes(from), `anchor missing for "${name}"`);
      let dead = false;
      try { suiteFn(await load(src.replace(from, to))); } catch { dead = true; }
      dead ? killed++ : alive.push(name);
    }
  };
  let msg = '';
  try {
    await run(tapeSrc, T, tapeSuite);
    await run(stepsSrc, S, stepsSuite);
    must(alive.length === 0, `survived: ${alive.join('; ')}`);
    msg = `${killed}/${T.length + S.length} mutants killed`;
    results.pop();
    results.push({ name: 'tape/steps mutation harness: structural anchors, all mutants killed', ok: true, detail: msg });
  } catch (e) {
    results.pop();
    results.push({ name: 'tape/steps mutation harness: structural anchors, all mutants killed', ok: false, detail: e.message });
  }
}

check('feeds: no tile ever sits on a dash, every stat tile has a number or a named loading state', () => {
  const tiles = [...html.matchAll(/<div class="v[^"]*"[^>]*data-(?:pulse|s)-[a-z-]+[^>]*>([^<]*)<\/div>/g)].map((m) => m[1].trim());
  must(tiles.length >= 7, `only ${tiles.length} stat tiles found`);
  for (const t of tiles) must(t && !/^(&mdash;|—|-|--|0)?$/.test(t), `tile text "${t}" is empty or a dash`);
  must(!html.includes('&mdash;</div>'), 'a tile still renders a dash');
  const feed = rd('dist/assets/feed.js');
  must(feed.includes("'Offline'") && html.includes('is-loading'), 'offline or loading states missing');
  const tape = rd('dist/assets/tape.js');
  must(tape.includes('is-skeleton') && tape.includes('unavailable'), 'tape has no loading or failure state');
  must(html.includes('Syncing the tape'), 'marquee has no loading label');
  return `${tiles.length} tiles: ${[...new Set(tiles)].join(' / ')}`;
});

check('tape: table of name, price, 24h and 7d line; icons from the market feed shown in greyscale', () => {
  must(rec.coingeckoApi.state === 'stated' && rec.coingeckoImages === undefined, 'market feed record missing or an image host is still registered');
  for (const col of ['Token', 'Price', '24h', '7d']) must(html.includes(`>${col}</th>`), `column ${col} missing`);
  must(html.includes('data-tape-body'), 'tape body missing');
  const css = rd('dist/assets/app.css');
  must(!/\.coin img/.test(css) && !rd('dist/assets/tape.js').includes("createElement('img')"), 'coin icons are still drawn');
  const tape = rd('dist/assets/tape.js');
  must(tape.includes('fmtChange') && tape.includes('sparkPath'), 'tape does not draw icons, change and lines');
  const headers = rd('dist/_headers');
  must(headers.includes('api.coingecko.com') && !headers.includes('coin-images'), 'csp should allow the market feed and no image host');
});

check('motion: typed word, three-row marquee, scroll reveal and pinned steps with rings are all present', () => {
  const css = rd('dist/assets/app.css');
  const main = rd('dist/assets/main.js');
  const motion = rd('dist/assets/motion.js');
  must(html.includes('data-rot') && /\.rot\.is-typing::after/.test(css) && /@keyframes caret/.test(css), 'typed word missing');
  must(motion.includes('WORDS') && /TYPE_MS|ERASE_MS/.test(motion), 'typing timings missing');
  must((html.match(/class="fan-row"/g) || []).length === 3, 'marquee is not three rows');
  must(/@keyframes marquee/.test(css) && /\.fan\.in \.fan-row:nth-child\(1\)[^}]*rotate\(-/.test(css) && /\.fan\.in \.fan-row:nth-child\(3\)[^}]*rotate\(/.test(css), 'rows do not fan out');
  must(/\.js \[data-reveal\][^}]*translate:[^}]*0\.7s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\)/.test(css), 'reveal does not use the reference easing and length');
  must(!/\.js \[data-reveal\][^}]*transform:/.test(css), 'reveal must use translate, so hover lifts keep working');
  must(motion.includes('IntersectionObserver') && main.includes('startReveal'), 'reveal is not wired');
  must((html.match(/role="tab"/g) || []).length === 3 && (html.match(/class="ring-fg"/g) || []).length === 3, 'pinned steps need three tabs with rings');
  must(/\.steps-pin\s*\{[^}]*position:\s*sticky/.test(css) && /\.ring-fg\s*\{[^}]*stroke-dasharray:\s*100/.test(css), 'sticky pin or ring styling missing');
  must(motion.includes('stepState') && motion.includes('pinProgress'), 'steps are not driven by scroll progress');
  for (const needle of ['prefers-reduced-motion']) must(motion.includes(needle), `${needle} not honoured in motion.js`);
  must(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.js \[data-reveal\][\s\S]*?\}/.test(css), 'reveal not neutralised for reduced motion');
});

check('motion: the pinned steps stay reachable without scripts or motion', () => {
  const css = rd('dist/assets/app.css');
  must(/html:not\(\.js\) \.steps\s*\{[^}]*height:\s*auto/.test(css), 'no-script layout missing');
});

/* ------------------------------------------------------------------ 10 rpc */
check('rpc: the open public node is the single endpoint, the 403 host is gone, nothing retries', () => {
  must(rec.chain.rpc === 'https://solana-rpc.publicnode.com', `chain rpc is ${rec.chain.rpc}`);
  const frag = (...p) => p.join('');
  const dead = new RegExp(frag('api\\.mainnet-', 'beta\\.solana\\.com'));
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'dist'))].filter((p) => /\.(css|html|js|json|mjs)$/.test(p));
  const hits = files.filter((p) => dead.test(readFileSync(p, 'utf8'))).map(rel);
  must(hits.length === 0, `403 host still named in ${hits.join(', ')}`);
  must(!existsSync(join(root, 'dist', '_worker.js')), 'a relay is still shipped');
  const util = rd('dist/assets/util.js');
  must(!/proxy|direct|retry|fallback/i.test(util), 'util.js still carries route switching or retry logic');
  must(rec.chain.proxyPath === undefined, 'proxyPath left on the chain record');
  return rec.chain.rpc;
});

await (async () => {
  const mod = await import(pathToFileURL(join(root, 'dist', 'assets', 'util.js')).href + `?t=${Date.now()}`);
  const realFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('forbidden', { status: 403 }); };
    let msg = '';
    try { await mod.rpcCall({ rpc: rec.chain.rpc }, 'getEpochInfo'); } catch (e) { msg = e.message; }
    check('rpc: a 403 is reported once and never retried', () => {
      must(msg === 'node answered 403', `error was "${msg}"`);
      must(calls.length === 1, `${calls.length} calls were made`);
      must(calls[0].url === rec.chain.rpc && calls[0].init.method === 'POST', 'wrong endpoint or method');
    });
    calls.length = 0;
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url) }); return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { absoluteSlot: 7 } }), { status: 200 }); };
    const out = await mod.rpcCall({ rpc: rec.chain.rpc }, 'getEpochInfo');
    check('rpc: a good answer returns the result from the single call', () => {
      must(out.absoluteSlot === 7 && calls.length === 1, 'result or call count wrong');
    });
  } finally {
    globalThis.fetch = realFetch;
  }
})();

check('dates: no date, month, year, timestamp, "as of" or copyright line anywhere in dist', () => {
  const months = /\b(january|february|march|april|june|july|august|september|october|november|december)\b/i;
  const iso = /\b(19|20)\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2}\b|\b\d{1,2}[-\/.]\d{1,2}[-\/.](19|20)\d{2}\b/;
  const api = /toISOString|toLocaleDateString|toLocaleTimeString|new Date|getFullYear/;
  const words = /\bas of\b|&copy;|©/i;
  const files = walk(join(root, 'dist')).filter((p) => /\.(html|css|js|json|webmanifest|svg|txt)$/.test(p) || p.endsWith('_headers'));
  const bad = [];
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    const visible = f.endsWith('.html') ? t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ') : '';
    if (iso.test(t) || api.test(t) || words.test(t) || months.test(t) || /\b(19|20)\d{2}\b/.test(visible)) bad.push(rel(f));
  }
  must(bad.length === 0, `date-like text in ${bad.join(', ')}`);
  return `${files.length} files`;
});

check('chain: solana, chain id 0x65 (101), shown on the page, direct publicnode rpc', () => {
  must(rec.chain.chainId === '0x65' && parseInt(rec.chain.chainId, 16) === 101, 'chain id is not 0x65 (101)');
  must(html.includes('chain id 0x65 (101)'), 'chain id not rendered');
  must(!html.includes('"asOf"') && !html.includes('"source"'), 'dated bookkeeping leaked into the embedded register');
});

/* ------------------------------------------------------------------ report */
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} gates passed`);
process.exit(failed ? 1 : 0);
