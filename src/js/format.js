const DASH = '—';
export { DASH };

export function usd(n) {
  if (!Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function price(n) {
  if (!Number.isFinite(n) || n <= 0) return DASH;
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(n >= 10 ? 2 : 3)}`;
  const decimals = Math.min(12, Math.max(4, -Math.floor(Math.log10(n)) + 3));
  return `$${n.toFixed(decimals)}`;
}

export function change(n) {
  if (!Number.isFinite(n)) return DASH;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
}

export function int(n) {
  return Number.isFinite(n) ? String(Math.round(n)) : DASH;
}
