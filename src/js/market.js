// Live market feed. Follows the market-source record only; nothing else gates it.
const POLL_MS = 60000;
const TIMEOUT_MS = 12000;
const ATTEMPTS = 4;
const BACKOFF_BASE = 1000;
const BACKOFF_CAP = 30000;
const CHUNK = 30;
const BOARD_SIZE = 10;

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : NaN;
};

async function fetchBoard(base) {
  const boosts = await getJson(`${base}/token-boosts/top/v1`);
  const list = Array.isArray(boosts) ? boosts : [];
  const addrs = [...new Set(list.filter((b) => b && b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress))];
  if (!addrs.length) throw new Error('no solana entries');

  const pairs = [];
  for (let i = 0; i < addrs.length; i += CHUNK) {
    const part = await getJson(`${base}/tokens/v1/solana/${addrs.slice(i, i + CHUNK).join(',')}`);
    if (Array.isArray(part)) pairs.push(...part);
  }

  // One market per token: its deepest pair.
  const best = new Map();
  for (const p of pairs) {
    const a = p && p.baseToken && p.baseToken.address;
    if (!a || p.chainId !== 'solana') continue;
    const liq = num(p.liquidity && p.liquidity.usd) || 0;
    const cur = best.get(a);
    if (!cur || liq > (num(cur.liquidity && cur.liquidity.usd) || 0)) best.set(a, p);
  }

  const items = [...best.values()].map((p) => ({
    address: p.baseToken.address,
    symbol: p.baseToken.symbol || '?',
    name: p.baseToken.name || '',
    imageUrl: (p.info && p.info.imageUrl) || '',
    price: num(p.priceUsd),
    change: num(p.priceChange && p.priceChange.h24),
    volume: num(p.volume && p.volume.h24),
    liquidity: num(p.liquidity && p.liquidity.usd),
  }));
  items.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const top = items.slice(0, BOARD_SIZE);
  if (!top.length) throw new Error('empty board');
  return top;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withBackoff(base) {
  let err;
  for (let n = 0; n < ATTEMPTS; n++) {
    try {
      return await fetchBoard(base);
    } catch (e) {
      err = e;
      if (n < ATTEMPTS - 1) await sleep(Math.min(BACKOFF_CAP, BACKOFF_BASE * 2 ** n) + Math.random() * 250);
    }
  }
  throw err;
}

export function startMarket(base, { onStatus, onData }) {
  let timer = 0;
  let busy = false;
  let last = null;

  async function cycle() {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    onStatus(last ? 'live' : 'loading');
    try {
      last = await withBackoff(base);
      onData(last);
      onStatus('live');
    } catch (e) {
      onStatus('error', Boolean(last)); // last good board stays on screen
    } finally {
      busy = false;
      if (!document.hidden) timer = setTimeout(cycle, POLL_MS);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else cycle();
  });
  cycle();
}
