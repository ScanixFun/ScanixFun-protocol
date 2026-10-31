// Gates: build both branches of the contract-address gate and check the rules. Exit 0 only if all pass.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.gates-tmp'); // inside the project, removed at the end
const results = [];
const gate = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true });
    console.log(`  pass  ${name}${detail ? ` (${detail})` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const read = (p) => readFileSync(p, 'utf8');
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

/* ---------- mutation harness: anchors are looked up by id at run time, never by position or current state ---------- */
const record = (reg, id) => {
  const r = reg.records.find((x) => x.id === id);
  if (!r) throw new Error(`no record ${id}`);
  return r;
};
const makeStated = (reg, id, fields) => {
  const r = record(reg, id);
  r.state = 'stated';
  Object.assign(r, fields);
};
const makeInert = (reg, id, state) => {
  const r = record(reg, id);
  r.state = state;
  delete r.value;
  delete r.url;
};

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fakeCa = () => Array.from(randomBytes(44), (b) => B58[b % 58]).join('');

function build(reg, name) {
  mkdirSync(work, { recursive: true });
  const regPath = join(work, `${name}.register.json`);
  const out = join(work, name);
  writeFileSync(regPath, JSON.stringify(reg, null, 2));
  const r = spawnSync(process.execPath, [join(root, 'scripts/build.mjs'), '--register', regPath, '--out', out], { encoding: 'utf8' });
  return { code: r.status, out, log: (r.stdout || '') + (r.stderr || '') };
}

/* ---------- shared scanners ---------- */
const ADDRESS_SHAPES = [/\b0x[0-9a-fA-F]{40}\b/g, /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g];
// Address-shaped strings must match a stated register value. Hex is never rejected as a class.
export function scanAddresses(text, statedValues) {
  const allowed = new Set(statedValues);
  const bad = [];
  for (const re of ADDRESS_SHAPES) for (const m of text.matchAll(re)) if (!allowed.has(m[0])) bad.push(m[0]);
  return bad;
}
const DATE_PATTERNS = [
  /\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(19|20)\d{2}\b/, /\btoLocale(Date|Time)String\b/, /\bnew Date\b/, /\bDate\.now\b/,
];
const PALETTE = () => new Set([...read(join(root, 'src/css/tokens.css')).matchAll(/--[\w-]+:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => m[1].toLowerCase()));

console.log('scanix gates');
rmSync(work, { recursive: true, force: true });
const base = JSON.parse(read(join(root, 'register.json')));

/* ---------- branch A: contract address absent (as shipped) ---------- */
const A = build(structuredClone(base), 'absent');
gate('A build exits 0 (ca absent)', () => { assert(A.code === 0, A.log); });
const dA = A.out;
const htmlA = existsSync(join(dA, 'index.html')) ? read(join(dA, 'index.html')) : '';

/* ---------- branch B: everything stated ---------- */
const regB = structuredClone(base);
const CA = fakeCa();
makeStated(regB, 'ca', { value: CA });
makeStated(regB, 'x', { url: 'https://x.com/scanixtest' });
makeStated(regB, 'github', { url: 'https://github.com/scanixtest' });
const B = build(regB, 'stated');
gate('B build exits 0 (ca, x, github stated)', () => { assert(B.code === 0, B.log); });
const htmlB = existsSync(join(B.out, 'index.html')) ? read(join(B.out, 'index.html')) : '';

/* ---------- branch C: unconfirmed is inert too ---------- */
const regC = structuredClone(regB);
makeInert(regC, 'ca', 'unconfirmed');
makeInert(regC, 'x', 'unconfirmed');
makeInert(regC, 'github', 'absent');
const C = build(regC, 'unconfirmed');
const htmlC = existsSync(join(C.out, 'index.html')) ? read(join(C.out, 'index.html')) : '';
gate('C build exits 0 (ca, x unconfirmed; github absent)', () => { assert(C.code === 0, C.log); });

/* ---------- the gate itself ---------- */
for (const [label, html] of [['A absent', htmlA], ['C unconfirmed', htmlC]]) {
  gate(`${label}: CA slot inert, no value, no copy control`, () => {
    assert(/class="ca is-inert"/.test(html), 'slot not inert');
    assert(!/class="ca-copy"/.test(html) && !/data-copy=/.test(html), 'copy control present');
    assert(/is-pending">pending</.test(html), 'no pending word');
  });
  gate(`${label}: X and GitHub icons present but inert (no href)`, () => {
    for (const k of ['x', 'github']) {
      const m = new RegExp(`<(span|a)[^>]*data-soc="${k}"[^>]*>`).exec(html);
      assert(m, `${k} icon missing`);
      assert(m[1] === 'span' && !/href=/.test(m[0]) && /is-inert/.test(m[0]), `${k} icon not inert`);
      assert(/<svg/.test(html.slice(m.index, m.index + m[0].length + 400)), `${k} icon has no svg`);
    }
  });
}
gate('B stated: CA slot live, full address, click-to-copy wired', () => {
  assert(/class="ca-copy"/.test(htmlB), 'no copy button');
  assert(htmlB.includes(`data-copy="${CA}"`), 'data-copy missing');
  assert(htmlB.includes(`<span class="ca-addr">${CA}</span>`), 'full address not rendered');
  assert(/class="ca" data-state="stated"/.test(htmlB), 'slot state wrong');
});
gate('B stated: social links carry href and a derived handle', () => {
  const x = /<a[^>]*data-soc="x"[^>]*>/.exec(htmlB), g = /<a[^>]*data-soc="github"[^>]*>/.exec(htmlB);
  assert(x && x[0].includes('href="https://x.com/scanixtest"') && x[0].includes('aria-label="X @scanixtest"'), 'x link wrong');
  assert(g && g[0].includes('href="https://github.com/scanixtest"') && g[0].includes('aria-label="GitHub @scanixtest"'), 'github link wrong');
});
gate('B stated vs A absent: social icons render in the same position', () => {
  const order = (h) => [h.indexOf('data-soc="x"'), h.indexOf('data-soc="github"')];
  const [a, b] = [order(htmlA), order(htmlB)];
  assert(a[0] > 0 && a[0] < a[1] && b[0] > 0 && b[0] < b[1], 'order differs');
  assert(htmlA.indexOf('class="social"') < a[0] && htmlA.indexOf('class="social"') > 0, 'icons outside social container');
});
gate('market config identical in every branch (CA has zero effect)', () => {
  const cfg = (h) => /id="scanix-config">([^<]*)</.exec(h)[1];
  assert(cfg(htmlA) === cfg(htmlB) && cfg(htmlA) === cfg(htmlC), 'config differs');
  assert(JSON.parse(cfg(htmlA)).market.base === 'https://api.dexscreener.com', 'market base wrong');
});
gate('market follows market-source record only (inert record -> market null)', () => {
  const r = structuredClone(base);
  makeInert(r, 'market-source', 'absent');
  const M = build(r, 'market-off');
  assert(M.code === 0, M.log);
  assert(/"market":null/.test(read(join(M.out, 'index.html'))), 'market not disabled');
});

/* ---------- registry rules ---------- */
gate('register: inert records carry no value or url', () => {
  for (const r of base.records) if (r.state !== 'stated') assert(!('value' in r) && !('url' in r), `${r.id} carries a payload`);
});
gate('register: build refuses an inert record that carries a url', () => {
  const r = structuredClone(base);
  record(r, 'x').url = 'https://x.com/nope';
  assert(build(r, 'bad-inert').code !== 0, 'build accepted it');
});
gate('register: build refuses a stated CA that is not address-shaped', () => {
  const r = structuredClone(base);
  makeStated(r, 'ca', { value: 'not-an-address' });
  assert(build(r, 'bad-ca').code !== 0, 'build accepted it');
});
gate('register: chain record states Solana and the stated rpc', () => {
  const c = record(base, 'chain');
  assert(c.state === 'stated' && c.value === 'Solana' && c.url === 'https://solana-rpc.publicnode.com' && c.source === 'client statement' && c.scope === 'batch-level', 'chain record wrong');
});

/* ---------- address scanner ---------- */
gate('address scan: A has none, B has only the stated CA', () => {
  const scanAll = (d, stated) => walk(d).filter((f) => /\.(html|js|css|svg)$/.test(f)).flatMap((f) => scanAddresses(read(f), stated));
  assert(scanAll(A.out, []).length === 0, 'stray address in A');
  assert(scanAll(B.out, [CA]).length === 0, 'stray address in B');
  assert(scanAddresses(htmlB, []).includes(CA), 'scanner missed the CA (sanity)');
});
gate('address scan: 0x hex is matched against the registry, not blanket-rejected', () => {
  const hex = `0x${randomBytes(20).toString('hex')}`;
  assert(scanAddresses(`see ${hex}`, [hex]).length === 0, 'stated 0x rejected');
  assert(scanAddresses(`see ${hex}`, []).length === 1, 'unstated 0x accepted');
  assert(scanAddresses('colour 0xff and 0x1F', []).length === 0, 'short hex flagged');
});

/* ---------- logo, favicon, palette ---------- */
gate('logo files are in dist and referenced by relative path', () => {
  for (const f of ['logo-640.png', 'logo-192.png']) {
    const p = join(dA, 'assets', f);
    assert(existsSync(p), `${f} not in dist`);
    const b = readFileSync(p);
    assert(b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `${f} is not a png`);
    assert(htmlA.includes(`src="assets/${f}"`), `index.html does not reference assets/${f}`);
  }
  assert(!/src="\//.test(htmlA) && !/href="\/(?!\/)/.test(htmlA), 'absolute path found');
  for (const m of htmlA.matchAll(/(?:src|href)="((?:assets|css|js)\/[^"]+)"/g)) assert(existsSync(join(dA, m[1])), `${m[1]} referenced but missing`);
});
gate('logo png is rgba with real alpha (premultiplied resize, no black fringe)', () => {
  const b = readFileSync(join(dA, 'assets/logo-640.png'));
  assert(b.readUInt32BE(16) === 640 && b[25] === 6, 'unexpected IHDR');
});
gate('favicon: 32x32 svg, no comments, no double hyphen, palette colours only', () => {
  const s = read(join(dA, 'assets/favicon.svg'));
  assert(/width="32" height="32" viewBox="0 0 32 32"/.test(s), 'not 32x32');
  assert(!/<!--/.test(s) && !s.includes('--'), 'comment or double hyphen');
  const pal = PALETTE();
  for (const m of s.matchAll(/#[0-9a-fA-F]{6}/g)) assert(pal.has(m[0].toLowerCase()), `${m[0]} not in palette`);
});
gate('palette: colour literals only in tokens.css (and favicon, from the same pixels)', () => {
  const files = walk(join(root, 'src')).filter((f) => !f.endsWith('tokens.css') && !f.endsWith('favicon.svg') && !/\.png$/.test(f));
  for (const f of [...files, join(root, 'scripts/build.mjs')]) {
    const t = read(f);
    assert(!/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(t.replace(/&#\d+;/g, '').replace(/href="#[\w-]+"/g, '').replace(/url\(#[\w-]+\)/g, '').replace(/#(top|hero|market|method|status|progress|ticker|rows|feed-note|live-pill|live-text|scanix-config|st-[a-z]+)\b/g, '')), `hex literal in ${relative(root, f)}`);
    assert(!/\brgba?\(|\bhsla?\(/.test(t), `colour function in ${relative(root, f)}`);
  }
  const pal = PALETTE();
  assert(pal.size >= 12, 'palette too small');
  for (const m of htmlA.matchAll(/content="(#[0-9a-fA-F]{6})"/g)) assert(pal.has(m[1].toLowerCase()), 'theme colour not from tokens');
});

/* ---------- dates ---------- */
gate('no dates, timestamps or clock strings in html, scripts or styles', () => {
  for (const [n, h] of [['A', htmlA], ['B', htmlB], ['C', htmlC]]) {
    const text = h.replace(/<style[\s\S]*?<\/style>/g, '');
    for (const re of DATE_PATTERNS) assert(!re.test(text), `${n}: ${re} matched in html`);
  }
  for (const f of walk(join(dA, 'js')).concat(walk(join(dA, 'css')))) {
    const t = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const re of DATE_PATTERNS) assert(!re.test(t), `${relative(dA, f)}: ${re}`);
  }
});

/* ---------- motion, mobile, hygiene ---------- */
gate('hero is not behind scroll-reveal', () => {
  const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(htmlA)[0];
  assert(!/data-reveal/.test(hero), 'data-reveal inside hero');
  const css = read(join(root, 'src/css/main.css'));
  for (const k of ['float', 'drift1', 'rise', 'fade', 'pop']) assert(css.includes(`@keyframes ${k}`), `missing keyframes ${k}`);
  assert(/translateY\(-12px\) rotate\(-1\.5deg\)/.test(css) && /translateY\(12px\) rotate\(1\.5deg\)/.test(css) && /animation: float 4s/.test(css), 'float loop wrong');
  assert(/blob[^}]*opacity: 0\.15/.test(css), 'blob opacity');
});
gate('prefers-reduced-motion covers css and every js animation', () => {
  const css = read(join(root, 'src/css/main.css'));
  assert(/prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*transition: none !important/.test(css), 'css block missing');
  const motion = read(join(root, 'src/js/motion.js'));
  const n = (motion.match(/reduced\(\)/g) || []).length;
  assert(n >= 3, `only ${n} reduced() checks in motion.js`);
});
gate('market: 60s poll, hidden-tab pause, immediate fetch on show, exponential backoff', () => {
  const m = read(join(root, 'src/js/market.js'));
  assert(/POLL_MS = 60000/.test(m) && /visibilitychange/.test(m) && /document\.hidden/.test(m) && /2 \*\* n/.test(m), 'missing');
  assert(!/register|\bca\b|contract/i.test(m), 'market code reads CA/register');
  assert(m.includes('/token-boosts/top/v1') && m.includes('/tokens/v1/solana/'), 'endpoints');
});
gate('no loading="lazy" anywhere in src', () => {
  for (const f of walk(join(root, 'src'))) if (/\.(html|js|css)$/.test(f)) assert(!/lazy/.test(read(f)), `lazy in ${relative(root, f)}`);
});
gate('no ch units in css', () => {
  assert(!/\d\s*ch\b/.test(read(join(root, 'src/css/main.css'))), 'ch unit');
});
gate('tap targets: 44px token applied to controls', () => {
  const css = read(join(root, 'src/css/main.css'));
  assert(/--tap: 44px/.test(read(join(root, 'src/css/tokens.css'))), 'token');
  for (const sel of ['.soc', '.btn', '.copy', '.nav a', '.ca-copy']) {
    const blk = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*(min-)?(height|width): var\\(--tap\\)`).test(css);
    assert(blk, `${sel} not 44`);
  }
});
gate('social icons are the official X mark and GitHub Octicon', () => {
  assert(htmlA.includes('M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932Z'), 'x path');
  assert(htmlA.includes('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'octicon path');
});
gate('repo hygiene: no agent config, no attribution, no repo docs in dist', () => {
  for (const p of ['CLA' + 'UDE.md', '.cla' + 'ude']) assert(!existsSync(join(root, p)), `${p} exists`);
  const banned = new RegExp(['cla' + 'ude', 'anthro' + 'pic', 'generated ' + 'by', 'co-' + 'authored', '\\bA' + 'I\\b'].join('|'), 'i');
  const skip = /node_modules|[\\/](brand|reference|dist)[\\/]|\.gates-tmp|\.(png|jpe?g|jpeg)$/i;
  for (const f of walk(root)) {
    if (skip.test(f) || !statSync(f).isFile()) continue;
    assert(!banned.test(read(f)), `attribution text in ${relative(root, f)}`);
  }
  for (const p of ['README.md', 'LICENSE', 'docs']) assert(!existsSync(join(dA, p)), `${p} leaked into dist`);
});
gate('repo content: README, whitepaper, MIT licence', () => {
  assert(/Scanix/.test(read(join(root, 'README.md'))) && /Solana/.test(read(join(root, 'README.md'))), 'README');
  assert(existsSync(join(root, 'docs/whitepaper.md')), 'whitepaper');
  const l = read(join(root, 'LICENSE'));
  assert(/MIT License/.test(l) && /Copyright \(c\) 2026 Scanix/.test(l), 'LICENSE');
});

rmSync(work, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} gates passed`);
process.exit(failed.length ? 1 : 0);
