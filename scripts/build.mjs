import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caSlotMarkup, esc, socialMarkup, validateRegister } from '../src/lib/register.js';
import { grayHex, parseTokens } from './lib/tokens.mjs';
import { logoPath } from './lib/trace.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : join(root, 'dist');

const register = JSON.parse(readFileSync(process.env.REGISTER_FILE ? resolve(process.env.REGISTER_FILE) : join(src, 'register.json'), 'utf8'));
const problems = validateRegister(register);
if (problems.length) {
  console.error('register invalid:\n  ' + problems.join('\n  '));
  process.exit(1);
}
const rec = register.records;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

/* css: tokens first, then rules */
const tokensCss = readFileSync(join(src, 'tokens.css'), 'utf8');
const stylesCss = readFileSync(join(src, 'styles.css'), 'utf8');
writeFileSync(join(dist, 'assets', 'app.css'), tokensCss + '\n' + stylesCss);

/* js */
for (const f of readdirSync(join(src, 'app'))) cpSync(join(src, 'app', f), join(dist, 'assets', f));
cpSync(join(src, 'lib', 'gate.js'), join(dist, 'assets', 'gate.js'));
cpSync(join(src, 'lib', 'tape.js'), join(dist, 'assets', 'tape-lib.js'));
cpSync(join(src, 'lib', 'steps.js'), join(dist, 'assets', 'steps-lib.js'));

/* colours derived from tokens (the only place literals live) */
const tokens = parseTokens(tokensCss);
const ink0 = grayHex(tokens['--black']);
const paper = grayHex(tokens['--white']);

/* the mark is traced from the real pixel grid of the brand png */
const logo = logoPath(join(root, 'brand', 'LOGO DUSKINATOR PNG.png'));

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="${ink0}"/>
<path fill-rule="evenodd" fill="${paper}" d="${logo.d}"/>
</svg>
`;
writeFileSync(join(dist, 'favicon.svg'), favicon);

writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: rec.name.value,
  short_name: rec.name.value,
  description: 'Read-only price desk for Solana.',
  start_url: '/',
  display: 'standalone',
  theme_color: ink0,
  background_color: ink0,
  icons: [{ src: '/favicon.svg', sizes: '32x32', type: 'image/svg+xml', purpose: 'any' }]
}, null, 2) + '\n');

writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n`);

/* html */
const faq = rec.ca.state === 'stated'
  ? 'It sits in the bar atop every page; press it to copy. The checker on the home page compares any string against it before you rely on that string.'
  : `Nothing has been ${rec.ca.state === 'unconfirmed' ? 'confirmed' : 'named'} so far. The bar up top stays dormant meanwhile; the checker admits that rather than guessing.`;

const publicRegister = { version: register.version, records: Object.fromEntries(Object.entries(register.records).map(([k, r]) => { const { asOf, source, ...rest } = r; return [k, rest]; })) };
const registerJson = JSON.stringify(publicRegister).replace(/</g, '\\u003c');
let html = readFileSync(join(src, 'index.html'), 'utf8');
const fill = {
  THEME_COLOR: ink0,
  MARK: `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="currentColor"><path fill-rule="evenodd" d="${logo.d}"/></svg>`,
  REGISTER_JSON: registerJson,
  SOCIALS: socialMarkup('x', rec.x) + socialMarkup('github', rec.github),
  CA_SLOT: caSlotMarkup(rec.ca),
  FAQ_CA: esc(faq),
  CHAIN_LABEL: `${rec.chain.value} \u00b7 chain id ${rec.chain.chainId} (${parseInt(rec.chain.chainId, 16)})`
};
for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(v);
if (/\{\{[A-Z_]+\}\}/.test(html)) {
  console.error('unfilled placeholder in html');
  process.exit(1);
}
writeFileSync(join(dist, 'index.html'), html);

/* headers: the one inline script is pinned by hash */
const inline = /<script>([^<]*)<\/script>/.exec(html)[1];
const hash = createHash('sha256').update(inline).digest('base64');
const origin = (u) => new URL(u).origin;
const connect = ["'self'", origin(rec.chain.rpc), origin(rec.quoteApi.value), origin(rec.tokenApi.value), origin(rec.coingeckoApi.value)];
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src ${[...new Set(connect)].join(' ')}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');
writeFileSync(join(dist, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/assets/*\n  Cache-Control: public, max-age=3600\n`);

console.log(`built dist/ (ca: ${rec.ca.state}, x: ${rec.x.state}, github: ${rec.github.state})`);
