// Motion helpers. Every entry point checks reduced motion and lands in the final state at once.
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Damped spring on a 0..1 progress value (semi-implicit Euler, fixed small step).
function spring(onFrame, onDone, { k = 170, c = 17 } = {}) {
  let x = 0, v = 0, last = performance.now();
  (function tick(now) {
    let dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      v += (-k * (x - 1) - c * v) * h;
      x += v * h;
      dt -= h;
    }
    onFrame(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.01) return onDone();
    requestAnimationFrame(tick);
  })(last);
}

export function initReveal() {
  const nodes = [...document.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('shown'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    const fresh = entries.filter((e) => e.isIntersecting);
    fresh.forEach((e, i) => {
      io.unobserve(e.target);
      const el = e.target;
      setTimeout(() => {
        spring(
          (p) => {
            el.style.opacity = String(Math.max(0, Math.min(1, p * 1.4)));
            el.style.transform = `translate3d(0, ${((1 - p) * 36).toFixed(2)}px, 0)`;
          },
          () => {
            el.style.opacity = '';
            el.style.transform = '';
            el.classList.add('shown');
          },
        );
      }, i * 90);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  nodes.forEach((n) => io.observe(n));
}

export function initProgress() {
  const bar = document.getElementById('progress');
  let queued = false;
  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  paint();
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.spot');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

export function initParallax() {
  if (reduced()) return;
  const hero = document.getElementById('hero');
  const layers = [...hero.querySelectorAll('.layer')];
  let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
  const frame = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    const sy = Math.min(scrollY, innerHeight * 1.2);
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth) || 1;
      l.style.setProperty('--px', `${(cx * 14 * d).toFixed(2)}px`);
      l.style.setProperty('--py', `${(cy * 14 * d).toFixed(2)}px`);
      l.style.setProperty('--sy', `${(-sy * 0.06 * d).toFixed(2)}px`);
    }
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(frame);
    else running = false;
  };
  const kick = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  addEventListener('scroll', kick, { passive: true });
  kick();
}

// Count a number up (or between values) and flash when a known value changes.
export function setNumber(el, to, fmt) {
  const from = el._v;
  const known = typeof from === 'number' && Number.isFinite(from);
  if (known && from === to) return;
  el._v = to;
  cancelAnimationFrame(el._raf);
  if (!Number.isFinite(to) || reduced()) {
    el.textContent = fmt(to);
    return;
  }
  const start = known ? from : 0;
  const t0 = performance.now();
  const dur = known ? 520 : 900;
  if (known) {
    el.classList.remove('num-flash');
    void el.offsetWidth;
    el.classList.add('num-flash');
  }
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(start + (to - start) * e);
    if (t < 1) el._raf = requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  el._raf = requestAnimationFrame(step);
}
