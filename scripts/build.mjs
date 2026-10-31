// Build: src/ + register.json -> dist/. No dependencies.
//   node scripts/build.mjs [--register path] [--out dir]
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? resolve(args[i + 1]) : fallback;
};
const registerPath = opt('--register', join(root, 'register.json'));
const outDir = opt('--out', join(root, 'dist'));

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function loadRegister(path) {
  const reg = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map();
  for (const r of reg.records) {
    if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) throw new Error(`record ${r.id}: bad state ${r.state}`);
    // Rule 1: an inert record carries no value and no url.
    if (r.state !== 'stated' && ('value' in r || 'url' in r)) throw new Error(`record ${r.id}: inert record carries value or url`);
    byId.set(r.id, r);
  }
  return { reg, byId };
}

// Rule 2: the url is stored, the handle is derived from it.
export function handleOf(url) {
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean)[0];
  return seg ? seg.replace(/^@/, '') : null;
}

const ICON_X = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>';
const ICON_GH = '<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

function social(rec, icon, key) {
  if (rec && rec.state === 'stated') {
    const h = handleOf(rec.url);
    const label = h ? `${rec.label} @${h}` : rec.label;
    return `      <a class="soc" data-soc="${key}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">${icon}</a>`;
  }
  // Inert: same box at every breakpoint, no href, no value.
  return `      <span class="soc is-inert" data-soc="${key}" data-state="${rec ? rec.state : 'absent'}" role="img" aria-disabled="true" aria-label="${esc((rec ? rec.label : key) + ', pending')}">${icon}</span>`;
}

function caSlot(rec) {
  if (rec && rec.state === 'stated') {
    if (!BASE58.test(rec.value || '')) throw new Error('ca: stated value is not a Solana address');
    return `    <div class="ca" data-state="stated">
      <span class="ca-label">Contract address</span>
      <button class="ca-copy" type="button" data-copy="${esc(rec.value)}" aria-label="Copy contract address">
        <span class="ca-addr">${esc(rec.value)}</span>
        <span class="ca-hint" aria-live="polite">Copy</span>
      </button>
    </div>`;
  }
  return `    <div class="ca is-inert" data-state="${rec ? rec.state : 'absent'}">
      <span class="ca-label">Contract address</span>
      <span class="ca-addr is-pending">pending</span>
    </div>`;
}

function chips(records) {
  return records.map((r) => {
    const on = r.state === 'stated';
    let word = 'pending';
    if (on) word = r.id === 'chain' ? r.value : r.id === 'market-source' ? 'live' : 'stated';
    return `      <li class="chip spot${on ? '' : ' is-inert'}" data-id="${esc(r.id)}" data-state="${r.state}"><span class="chip-k">${esc(r.label)}</span><span class="chip-v">${esc(word)}</span></li>`;
  }).join('\n');
}

export function render(template, byId, reg, theme) {
  const market = byId.get('market-source');
  // Market follows the market-source record only.
  const config = {
    market: market && market.state === 'stated' ? { base: market.url } : null,
  };
  return template
    .replace('@@THEME@@', theme)
    .replace('@@CONFIG@@', JSON.stringify(config))
    .replace('@@SOCIAL@@', [social(byId.get('x'), ICON_X, 'x'), social(byId.get('github'), ICON_GH, 'github')].join('\n'))
    .replace('@@CA@@', caSlot(byId.get('ca')))
    .replace('@@CHIPS@@', chips(reg.records));
}

export function build() {
  const { reg, byId } = loadRegister(registerPath);
  const tokens = readFileSync(join(root, 'src/css/tokens.css'), 'utf8');
  const theme = /--blue:\s*(#[0-9a-fA-F]{6})/.exec(tokens)[1];

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const d of ['css', 'js']) cpSync(join(root, 'src', d), join(outDir, d), { recursive: true });

  // Assets are copied file by file so a missing logo fails the build.
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  for (const f of ['logo-640.png', 'logo-192.png', 'favicon.svg']) {
    const from = join(root, 'src/assets', f);
    if (!existsSync(from) || statSync(from).size < 100) throw new Error(`missing asset: ${f}`);
    cpSync(from, join(outDir, 'assets', f));
  }

  const html = render(readFileSync(join(root, 'src/index.html'), 'utf8'), byId, reg, theme);
  if (/@@\w+@@/.test(html)) throw new Error('unreplaced placeholder');
  writeFileSync(join(outDir, 'index.html'), html);

  // The page must reference the logo with a path that exists inside the output.
  for (const ref of html.match(/assets\/logo-\d+\.png/g) || []) {
    if (!existsSync(join(outDir, ref))) throw new Error(`index.html references ${ref} but it is not in the output`);
  }
  const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(join(d, e.name)) : 1), 0);
  console.log(`build ok -> ${outDir} (${count(outDir)} files; ca=${byId.get('ca').state}, x=${byId.get('x').state}, github=${byId.get('github').state})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
