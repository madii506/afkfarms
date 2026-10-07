/* AFK world: smooth scroll, block-drop reveals, parallax, XP bar, block-break particles. */
(() => {
  'use strict';
  window.__world = true;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePtr = matchMedia('(pointer: fine)').matches;

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    try {
      lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, syncTouch: false });
      window.__lenis = lenis;
    } catch (e) { lenis = null; }
  }
  const NAV = 66;
  const ease = t => 1 - Math.pow(1 - t, 4);
  window.__scrollTo = el => {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -NAV + 2, duration: 1.5, easing: ease });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1); const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault(); window.__scrollTo(el);
  });

  /* ---------- headings: letters drop in like blocks ---------- */
  function split(h) {
    let i = 0;
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            [...part].forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = c; w.appendChild(s); });
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(h); h.classList.add('split');
  }
  $$('.drop-title').forEach(split);

  /* ---------- reveal on scroll ---------- */
  const done = el => { el.classList.remove('rv', 'in'); el.style.removeProperty('--d'); };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; io.unobserve(el); el.classList.add('in');
      if (el.classList.contains('rv')) {
        const d = parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 0;
        setTimeout(() => done(el), 1000 + d * 85);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }) : null;
  $$('.rv, .drop-title').forEach(el => { if (io && !reduce) io.observe(el); else { el.classList.add('in'); if (el.classList.contains('rv')) done(el); } });

  /* ---------- parallax + mouse drift + xp bar ---------- */
  const par = $$('[data-speed]').map(el => ({ el, s: +el.dataset.speed, sec: el.closest('section, .hero') || document.body, hero: !!el.closest('.hero'), mouse: +(el.dataset.mouse || 0) }));
  $$('[data-mouse]:not([data-speed])').forEach(el => par.push({ el, s: 0, sec: el.closest('section') || document.body, hero: true, mouse: +el.dataset.mouse }));
  const xpFill = $('#xpFill'), xpLvl = $('#xpLvl');
  let mx = 0, my = 0, tmx = 0, tmy = 0, lastY = -1, lastLvl = -1, dirty = true;
  if (finePtr && !reduce) window.addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; dirty = true; }, { passive: true });
  window.addEventListener('resize', () => { dirty = true; }, { passive: true });
  const heroH = () => ($('.hero') || {}).offsetHeight || 800;
  function frame(t) {
    if (lenis) lenis.raf(t);
    const y = window.scrollY, vh = innerHeight;
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    const moving = Math.abs(tmx - mx) > 0.001 || Math.abs(tmy - my) > 0.001;
    if (y !== lastY || moving || dirty) {
      dirty = false;
      if (!reduce) {
        const hh = heroH();
        for (const p of par) {
          let rel;
          if (p.hero) { if (y > hh + 100) continue; rel = y; }
          else { const r = p.sec.getBoundingClientRect(); if (r.bottom < -300 || r.top > vh + 300) continue; rel = vh / 2 - (r.top + r.height / 2); }
          const ox = p.mouse ? mx * p.mouse * 2 : 0, oy = p.mouse ? my * p.mouse * 1.2 : 0;
          p.el.style.translate = `${ox.toFixed(1)}px ${(rel * p.s + oy).toFixed(1)}px`;
        }
      }
      if (y !== lastY) {
        const max = Math.max(1, document.documentElement.scrollHeight - vh), f = Math.min(1, y / max);
        if (xpFill) xpFill.style.width = (f * 100).toFixed(2) + '%';
        const lvl = Math.round(f * 30);
        if (xpLvl && lvl !== lastLvl) { xpLvl.textContent = lvl; if (lastLvl >= 0 && lvl > lastLvl) { xpLvl.classList.remove('up'); void xpLvl.offsetWidth; xpLvl.classList.add('up'); } lastLvl = lvl; }
      }
      lastY = y;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- block-break particles on every button ---------- */
  const COLS = { grass: ['#5cbf3a', '#3d8f27', '#8fdc68'], gold: ['#ffc83a', '#c98f10', '#ffe189'], stone: ['#8e97a4', '#6a7280', '#c9ced6'] };
  const box = $('#parts');
  document.addEventListener('pointerdown', e => {
    if (reduce || !box) return;
    const b = e.target.closest('.btn, .chip, .farm-tabs button, .qpick button, .seg button'); if (!b) return;
    const c = b.classList.contains('grass') ? COLS.grass : b.classList.contains('gold') ? COLS.gold : COLS.stone;
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('i'), a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
      p.style.left = e.clientX + 'px'; p.style.top = e.clientY + 'px';
      p.style.setProperty('--x', (Math.cos(a) * v).toFixed(0) + 'px'); p.style.setProperty('--y', (Math.sin(a) * v * .7 - 40).toFixed(0) + 'px');
      p.style.background = c[i % 3]; p.style.animationDuration = (550 + Math.random() * 350).toFixed(0) + 'ms';
      p.addEventListener('animationend', () => p.remove()); box.appendChild(p);
    }
  }, { passive: true });
})();
