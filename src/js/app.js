import { startMarket } from './market.js';
import { initReveal, initProgress, initSpotlight, initParallax, setNumber, reduced } from './motion.js';
import * as F from './format.js';

const $ = (s, r = document) => r.querySelector(s);
const config = JSON.parse($('#scanix-config').textContent);

const rowsEl = $('#rows');
const tickerEl = $('#ticker');
const pill = $('#live-pill');
const pillText = $('#live-text');
const note = $('#feed-note');

let board = [];
let sort = 'volume';
const rowMap = new Map();

const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

/* ---------- clipboard ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

document.addEventListener('click', async (e) => {
  const ca = e.target.closest('.ca-copy');
  if (ca) {
    const ok = await copyText(ca.dataset.copy);
    const hint = $('.ca-hint', ca);
    hint.textContent = ok ? 'Copied' : 'Press and hold to copy';
    ca.classList.toggle('is-copied', ok);
    clearTimeout(ca._t);
    ca._t = setTimeout(() => { hint.textContent = 'Copy'; ca.classList.remove('is-copied'); }, 1800);
    return;
  }
  const btn = e.target.closest('.copy');
  if (btn) {
    const ok = await copyText(btn.dataset.addr);
    btn.classList.toggle('is-copied', ok);
    btn.setAttribute('aria-label', ok ? 'Address copied' : 'Copy failed');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-copied'); btn.setAttribute('aria-label', btn.dataset.label); }, 1600);
  }
});

/* ---------- token art ---------- */
function tile(item, cls = '') {
  const d = document.createElement('span');
  d.className = `tok-tile ${cls}`.trim();
  d.textContent = (item.symbol || '?').trim().charAt(0).toUpperCase() || '?';
  d.setAttribute('aria-hidden', 'true');
  return d;
}

function art(item) {
  if (!item.imageUrl) return tile(item);
  const img = document.createElement('img');
  img.className = 'tok-img';
  img.alt = '';
  img.width = 40;
  img.height = 40;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(tile(item)), { once: true });
  img.src = item.imageUrl;
  return img;
}

/* ---------- board ---------- */
const sorters = {
  volume: (a, b) => (b.volume || 0) - (a.volume || 0),
  move: (a, b) => (Number.isFinite(b.change) ? b.change : -Infinity) - (Number.isFinite(a.change) ? a.change : -Infinity),
  depth: (a, b) => (b.liquidity || 0) - (a.liquidity || 0),
};

function skeletonRows() {
  rowsEl.replaceChildren();
  for (let i = 0; i < 10; i++) {
    const r = document.createElement('div');
    r.className = 'row sk-row';
    r.innerHTML = '<span class="c-rank"><i class="sk-b" style="width:16px;height:14px"></i></span>' +
      '<div class="c-tok tok"><i class="sk-b sk-c"></i><div class="tok-meta"><i class="sk-b" style="width:72px;height:14px"></i><i class="sk-b" style="width:104px;height:12px;margin-top:6px"></i></div></div>' +
      '<span class="c-price"><i class="sk-b" style="width:70px;height:14px;margin-left:auto"></i></span>' +
      '<span class="c-chg"><i class="sk-b" style="width:48px;height:14px;margin-left:auto"></i></span>' +
      '<span class="c-vol"><i class="sk-b" style="width:64px;height:14px;margin-left:auto"></i></span>' +
      '<span class="c-liq"><i class="sk-b" style="width:64px;height:14px;margin-left:auto"></i></span>' +
      '<span class="c-act"></span>';
    rowsEl.append(r);
  }
}

function skeletonTicker() {
  tickerEl.replaceChildren();
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'tk sk';
    s.innerHTML = '<i class="sk-b" style="width:100%;height:100%;border-radius:999px"></i>';
    tickerEl.append(s);
  }
}

function buildRow(item) {
  const r = document.createElement('div');
  r.className = 'row spot';
  r.dataset.addr = item.address;
  const rank = document.createElement('span');
  rank.className = 'c-rank';
  const tok = document.createElement('div');
  tok.className = 'c-tok tok';
  const meta = document.createElement('div');
  meta.className = 'tok-meta';
  meta.innerHTML = '<span class="tok-sym"></span><span class="tok-name"></span>';
  tok.append(art(item), meta);
  const cells = {};
  for (const k of ['price', 'chg', 'vol', 'liq']) {
    cells[k] = document.createElement('span');
    cells[k].className = `c-${k}`;
  }
  const act = document.createElement('span');
  act.className = 'c-act';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy';
  btn.innerHTML = COPY_SVG;
  btn.dataset.addr = item.address;
  act.append(btn);
  r.append(rank, tok, cells.price, cells.chg, cells.vol, cells.liq, act);
  return { el: r, rank, sym: $('.tok-sym', meta), name: $('.tok-name', meta), cells, btn };
}

function fillRow(row, item, i) {
  row.rank.textContent = String(i + 1);
  row.sym.textContent = item.symbol;
  row.name.textContent = item.name || F.DASH;
  const label = `Copy address for ${item.symbol}`;
  row.btn.dataset.label = label;
  if (!row.btn.classList.contains('is-copied')) row.btn.setAttribute('aria-label', label);
  setNumber(row.cells.price, item.price, F.price);
  setNumber(row.cells.vol, item.volume, F.usd);
  setNumber(row.cells.liq, item.liquidity, F.usd);
  setNumber(row.cells.chg, item.change, F.change);
  row.cells.chg.classList.toggle('up', item.change > 0);
  row.cells.chg.classList.toggle('down', item.change < 0);
}

function renderBoard(first) {
  const ordered = [...board].sort(sorters[sort]);
  const seen = new Set();
  const frag = document.createDocumentFragment();
  ordered.forEach((item, i) => {
    seen.add(item.address);
    let row = rowMap.get(item.address);
    const isNew = !row;
    if (isNew) {
      row = buildRow(item);
      rowMap.set(item.address, row);
      if (!reduced()) { row.el.classList.add('in'); row.el.style.setProperty('--n', String(i)); }
    }
    fillRow(row, item, i);
    frag.append(row.el);
  });
  for (const [a, row] of rowMap) if (!seen.has(a)) { row.el.remove(); rowMap.delete(a); }
  if (first) rowsEl.replaceChildren();
  rowsEl.append(frag);
}

/* ---------- ticker ---------- */
let tickerSig = '';
function renderTicker() {
  const items = [...board].sort(sorters.volume);
  const sig = items.map((i) => i.address).join();
  if (sig !== tickerSig) {
    tickerSig = sig;
    tickerEl.replaceChildren();
    for (let copy = 0; copy < 2; copy++) {
      for (const it of items) {
        const t = document.createElement('span');
        t.className = 'tk';
        t.dataset.addr = it.address;
        if (copy) t.setAttribute('aria-hidden', 'true');
        const a = art(it);
        a.classList.add('tk-art');
        if (a.tagName === 'IMG') { a.width = 24; a.height = 24; }
        t.append(a);
        t.insertAdjacentHTML('beforeend', '<span class="tk-sym"></span><span class="tk-px"></span><span class="tk-ch"></span>');
        tickerEl.append(t);
      }
    }
  }
  for (const t of tickerEl.children) {
    const it = items.find((x) => x.address === t.dataset.addr);
    if (!it) continue;
    $('.tk-sym', t).textContent = it.symbol;
    $('.tk-px', t).textContent = F.price(it.price);
    const ch = $('.tk-ch', t);
    ch.textContent = F.change(it.change);
    ch.className = `tk-ch ${it.change > 0 ? 'tk-up' : it.change < 0 ? 'tk-down' : ''}`;
  }
}

/* ---------- stats ---------- */
function renderStats() {
  const sum = (k) => board.reduce((s, i) => s + (Number.isFinite(i[k]) ? i[k] : 0), 0);
  setNumber($('#st-vol'), sum('volume'), F.usd);
  setNumber($('#st-liq'), sum('liquidity'), F.usd);
  setNumber($('#st-n'), board.length, F.int);
  const withChange = board.filter((i) => Number.isFinite(i.change));
  const top = withChange.sort((a, b) => b.change - a.change)[0];
  $('#st-top').textContent = top ? `${top.symbol} ${F.change(top.change)}` : F.DASH;
}

/* ---------- status ---------- */
function setStatus(state, hadData) {
  pill.dataset.state = state === 'error' ? 'error' : state === 'live' ? 'live' : 'idle';
  pillText.textContent = state === 'live' ? 'Live feed' : state === 'error' ? 'Feed paused' : 'Connecting';
  if (state === 'error') {
    note.textContent = hadData ? `${F.DASH} Source did not answer. Showing the last good board.` : `${F.DASH} Source did not answer. Retrying.`;
    if (!hadData) {
      rowsEl.replaceChildren();
      const e = document.createElement('p');
      e.className = 'rows-empty';
      e.textContent = `${F.DASH} The feed is not answering right now.`;
      rowsEl.append(e);
      tickerEl.replaceChildren();
      const d = document.createElement('span');
      d.className = 'tk';
      d.textContent = `${F.DASH} feed unavailable`;
      tickerEl.append(d);
      tickerSig = '';
    }
  } else if (state === 'live') {
    note.textContent = '';
  }
}

/* ---------- tabs ---------- */
const tabs = [...document.querySelectorAll('.tab')];
const ink = $('.tab-ink');
function placeInk() {
  const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true');
  ink.style.width = `${t.offsetWidth}px`;
  ink.style.transform = `translateX(${t.offsetLeft}px)`;
}
function selectTab(t, focus) {
  tabs.forEach((x) => { x.setAttribute('aria-selected', String(x === t)); x.tabIndex = x === t ? 0 : -1; });
  rowsEl.setAttribute('aria-labelledby', t.id);
  sort = t.dataset.sort;
  placeInk();
  if (focus) t.focus();
  if (board.length) renderBoard(false);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length], true); }
    if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0], true); }
    if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1], true); }
  });
});
addEventListener('resize', placeInk);
document.fonts && document.fonts.ready.then(placeInk);

/* ---------- boot ---------- */
initProgress();
initSpotlight();
initReveal();
initParallax();
placeInk();

if (config.market) {
  skeletonRows();
  skeletonTicker();
  let first = true;
  startMarket(config.market.base, {
    onStatus: setStatus,
    onData: (items) => {
      board = items;
      renderBoard(first);
      renderTicker();
      renderStats();
      first = false;
    },
  });
} else {
  pill.dataset.state = 'error';
  pillText.textContent = 'Feed pending';
  rowsEl.innerHTML = `<p class="rows-empty">${F.DASH} pending</p>`;
}
