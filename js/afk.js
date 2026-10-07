/* AFK front end. No framework, no keys: the server builds PumpSwap transactions, your wallet signs. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ART = '<img src="/img/chest.png" alt="">';
  const S = { pools: [], sort: 'yield', min: 25, q: '', cfg: {}, pool: null, tab: 'add', slip: 2, pct: 100, toSol: true, busy: false, positions: null, updated: 0, amt: '' };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };

  /* ---------- utils ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = bytes => { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x === 0) s = '1' + s; else break; } return s; };
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  function compact(n) {
    n = Number(n); if (!isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    if (a >= 100) return n.toFixed(0);
    if (a >= 1) return n.toFixed(2);
    if (a === 0) return '0';
    return n.toPrecision(3);
  }
  function fsol(n, d) { n = Number(n) || 0; if (d != null) return n.toFixed(d); const a = Math.abs(n); return a >= 1000 ? compact(n) : a >= 1 ? n.toFixed(2) : a >= 0.01 ? n.toFixed(3) : a > 0 ? n.toFixed(5) : '0'; }
  const coinAmt = (raw, dec) => Number(BigInt(raw || '0')) / Math.pow(10, dec || 6);
  const pctTxt = (x, d = 2) => (x * 100).toFixed(d) + '%';
  const age = ms => { if (!ms) return ''; const h = (Date.now() - ms) / 36e5; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd'; };
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
  async function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {};
    const r = await fetch('/api/' + path, opt);
    let j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || ('Request failed (' + r.status + ')')); e.logs = j && j.logs; throw e; }
    return j;
  }
  function tokImg(p, cls = 'tok') {
    const letter = esc(((p.symbol || p.name || '?')[0] || '?').toUpperCase());
    const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : '';
    return `<span class="${cls}"><span class="ph">${letter}</span>${img}</span>`;
  }
  const label = p => esc(p.symbol ? '$' + p.symbol : short(p.mint));

  /* ---------- rolling digits: every number on the page rolls to its real value ---------- */
  const isD = c => c >= '0' && c <= '9';
  const STRIP = '<span class="dg"><span>' + '0123456789'.split('').map(n => `<i>${n}</i>`).join('') + '</span></span>';
  function odo(el, text) {
    if (!el) return;
    text = String(text);
    if (el._t === text) return;
    const prev = el._t, chars = [...text];
    const same = prev != null && prev.length === text.length && [...prev].every((c, i) => isD(c) === isD(chars[i]) && (isD(c) || c === chars[i]));
    if (!same) {
      el.innerHTML = chars.map(c => isD(c) ? STRIP : `<span class="sc">${esc(c)}</span>`).join('');
      el.classList.add('odo');
    }
    el._t = text;
    const strips = $$('.dg > span', el);
    const go = () => { let k = 0; chars.forEach(c => { if (!isD(c)) return; const s = strips[k++]; if (s) { s.style.transitionDelay = (k * 35) + 'ms'; s.style.transform = `translateY(calc(var(--h) * ${-+c}))`; } }); };
    if (same) go(); else setTimeout(go, 40);
    el.setAttribute('aria-label', text);
  }
  const nfmt = (n, d = 0) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const tiny = n => { n = Number(n) || 0; if (n === 0) return '0'; const a = Math.abs(n); return a >= 100 ? nfmt(n, 0) : a >= 1 ? n.toFixed(2) : a >= 0.01 ? n.toFixed(4) : a >= 1e-6 ? String(+n.toPrecision(3)) : '<0.000001'; };

  /* ---------- wallet (Wallet Standard) ---------- */
  const W = { list: [], w: null, acct: null };
  function addWallet(w) {
    try {
      if (!w || !w.features || !w.name) return;
      const sol = (w.chains || []).some(c => String(c).startsWith('solana:'));
      const can = w.features['standard:connect'] && (w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction']);
      if (!sol || !can || W.list.some(x => x.name === w.name)) return;
      W.list.push(w);
      if (!W.w && store.get('afk:wallet') === w.name && w.accounts && w.accounts.length) use(w, w.accounts[0]);
      if (!$('#wModal').hidden) renderWallets();
    } catch (e) { }
  }
  const walletApi = Object.freeze({ register: (...ws) => { ws.forEach(addWallet); return () => { }; } });
  window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail(walletApi); } catch (_) { } });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: walletApi })); } catch (_) { }

  function use(w, acct) {
    W.w = w; W.acct = acct; store.set('afk:wallet', w.name);
    $('#walletBtn').classList.add('on'); $('#walletLabel').textContent = short(acct.address);
    try { w.features['standard:events'] && w.features['standard:events'].on('change', ({ accounts }) => { if (accounts && W.w === w) { if (accounts.length) use(w, accounts[0]); else disconnect(); } }); } catch (e) { }
    loadPositions(); if (S.pool && S.pool.pool) openPool(S.pool.pool, true);
  }
  function disconnect() {
    try { W.w && W.w.features['standard:disconnect'] && W.w.features['standard:disconnect'].disconnect(); } catch (e) { }
    W.w = null; W.acct = null; store.set('afk:wallet', '');
    $('#walletBtn').classList.remove('on'); $('#walletLabel').textContent = 'Connect wallet';
    renderPositions(); if (S.pool) renderDrawer();
  }
  const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
  function renderWallets() {
    const box = $('#wList');
    $('#wModal h3').textContent = W.w ? 'Your wallet' : 'Connect a wallet';
    if (W.w) {
      box.innerHTML = `<p>${esc(W.w.name)}<br><code>${esc(W.acct.address)}</code></p><button class="wopt" type="button" id="wCopy">Copy address</button><button class="wopt" type="button" id="wOut">Disconnect</button>`;
      $('#wCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(W.acct.address).then(() => toast('Address copied')); };
      $('#wOut').onclick = () => { disconnect(); $('#wModal').hidden = true; toast('Disconnected'); };
      return;
    }
    if (!W.list.length) {
      const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
      box.innerHTML = mobile
        ? `<p>Open AFK inside your wallet app's browser:</p>
           <a class="wopt" href="https://phantom.app/ul/browse/${here}?ref=${ref}">Open in Phantom</a>
           <a class="wopt" href="https://solflare.com/ul/v1/browse/${here}?ref=${ref}">Open in Solflare</a>`
        : `<p>No Solana wallet found in this browser. Install one, then reload:</p>
           <a class="wopt" href="https://phantom.com/download" target="_blank" rel="noopener">Phantom</a>
           <a class="wopt" href="https://solflare.com/download" target="_blank" rel="noopener">Solflare</a>
           <a class="wopt" href="https://backpack.app/download" target="_blank" rel="noopener">Backpack</a>`;
      return;
    }
    box.innerHTML = W.list.map((w, i) => `<button class="wopt" data-i="${i}" type="button">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : ''}${esc(w.name)}<small>Detected</small></button>`).join('');
  }
  function connect() { renderWallets(); $('#wModal').hidden = false; }
  $('#wList').addEventListener('click', async e => {
    const b = e.target.closest('button.wopt[data-i]'); if (!b) return;
    const w = W.list[+b.dataset.i];
    try {
      b.disabled = true;
      const r = await w.features['standard:connect'].connect();
      const acct = (r && r.accounts && r.accounts[0]) || (w.accounts && w.accounts[0]);
      if (!acct) throw new Error('No account shared');
      $('#wModal').hidden = true; use(w, acct); toast('Connected ' + short(acct.address));
    } catch (err) { toast(err && err.message ? err.message : 'Connection cancelled'); }
    finally { b.disabled = false; }
  });
  $('#walletBtn').addEventListener('click', connect);
  $('#wClose').addEventListener('click', () => { $('#wModal').hidden = true; });
  $('#wModal').addEventListener('click', e => { if (e.target.id === 'wModal') $('#wModal').hidden = true; });
  const needWallet = () => { if (!W.w) { connect(); return true; } return false; };

  async function waitFor(sig) {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      await new Promise(r => setTimeout(r, 1300));
      try {
        const s = await api('status?sig=' + sig);
        if (s.err) throw Object.assign(new Error('The transaction failed on-chain.'), { chain: s.err });
        if (s.status === 'confirmed' || s.status === 'finalized') return true;
      } catch (e) { if (e.chain) throw e; }
    }
    throw new Error('Not confirmed after 90 seconds. Check the link below before trying again.');
  }
  async function signSend(txs, step) {
    const f = W.w.features, chain = 'solana:mainnet', bytes = txs.map(t => fromB64(t.tx)), sigs = [];
    if (bytes.length === 1 && f['solana:signAndSendTransaction']) {
      step('sign');
      const [r] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ account: W.acct, chain, transaction: bytes[0], options: { commitment: 'confirmed', preflightCommitment: 'processed', maxRetries: 3 } });
      const sig = typeof r.signature === 'string' ? r.signature : b58(r.signature); sigs.push(sig);
      step('confirm', sigs); await waitFor(sig); return sigs;
    }
    if (f['solana:signTransaction']) {
      step('sign');
      const outs = await f['solana:signTransaction'].signTransaction(...bytes.map(t => ({ account: W.acct, chain, transaction: t })));
      for (let i = 0; i < outs.length; i++) {
        step('confirm', sigs, i);
        const { sig } = await api('send', { tx: toB64(outs[i].signedTransaction) }); sigs.push(sig);
        step('confirm', sigs, i); await waitFor(sig);
      }
      return sigs;
    }
    for (let i = 0; i < bytes.length; i++) {
      step('sign', sigs, i);
      const [r] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ account: W.acct, chain, transaction: bytes[i] });
      const sig = typeof r.signature === 'string' ? r.signature : b58(r.signature); sigs.push(sig);
      step('confirm', sigs, i); await waitFor(sig);
    }
    return sigs;
  }

  /* ---------- farms board ---------- */
  const KEY = { yield: p => p.yieldDay, tvl: p => p.tvlSol, vol: p => p.volSol, fee: p => p.lpBps * 1e6 + p.yieldDay, chg: p => p.change24 };
  function visible() {
    const q = S.q.trim().toLowerCase();
    return S.pools.filter(p => p.tvlSol >= S.min && (!q || (p.name + ' ' + p.symbol + ' ' + p.mint).toLowerCase().includes(q))).sort((x, y) => KEY[S.sort](y) - KEY[S.sort](x));
  }
  function renderPools() {
    const rows = $('#rows'); const list = visible();
    if (!list.length) {
      rows.innerHTML = `<div class="empty">${ART}<b>${S.q ? 'No farm on the board matches that.' : 'No farms this size right now.'}</b>${S.q ? 'Paste the coin address in the search at the top to look it up on-chain.' : 'Try a smaller pool size.'}</div>`;
      return;
    }
    const top = Math.max(...list.map(p => p.yieldDay), 1e-9);
    rows.innerHTML = list.map((p, i) => `
      <div class="tr row" data-pool="${esc(p.pool)}" style="animation-delay:${Math.min(i, 14) * 20}ms">
        <span class="c-farm">${tokImg(p)}<span class="nm"><b>${esc(p.name || short(p.mint))}${p.tvlSol < 25 ? '<span class="tiny">small</span>' : ''}</b><small>${label(p)} · ${compact(p.mcapSol)} SOL mcap${p.created ? ' · ' + age(p.created) : ''}</small></span></span>
        <span class="c-yield"><span class="big">${pctTxt(p.yieldDay)}</span><span class="mbar"><i style="width:${Math.max(3, Math.round(p.yieldDay / top * 100))}%"></i></span></span>
        <span class="c-tvl num">${compact(p.tvlSol)} SOL</span>
        <span class="c-vol num">${compact(p.volSol)} SOL</span>
        <span class="c-fee num">${(p.lpBps / 100).toFixed(2)}%</span>
        <span class="c-chg num ${p.change24 >= 0 ? 'up' : 'down'}">${p.change24 >= 0 ? '+' : ''}${(+p.change24).toFixed(1)}%</span>
        <span class="c-go"><button class="btn sm grass" type="button">Plant</button></span>
      </div>`).join('');
  }
  function renderStats() {
    const P = S.pools; if (!P.length) return;
    const tvl = P.reduce((a, p) => a + p.tvlSol, 0), vol = P.reduce((a, p) => a + p.volSol, 0), fees = P.reduce((a, p) => a + p.volSol * p.lpBps / 10000, 0);
    const set = (k, v) => odo($(`#stats b[data-k="${k}"]`), v);
    set('n', nfmt(P.length)); set('tvl', nfmt(tvl)); set('vol', nfmt(vol)); set('fees', nfmt(fees, fees < 1000 ? 1 : 0));
    $('#kickN').textContent = P.length + ' farms live on PumpSwap';
  }

  /* ---------- hero flip card: the real top farms, one at a time ---------- */
  const F = { list: [], i: 0, built: false };
  function flipList() {
    const big = S.pools.filter(p => p.tvlSol >= 25 && p.volSol > 0).sort((a, b) => b.yieldDay - a.yieldDay);
    F.list = (big.length ? big : S.pools.slice().sort((a, b) => b.yieldDay - a.yieldDay)).slice(0, 8);
    if (F.list.length) $('#flip').classList.add('run');
    if (F.i >= F.list.length) F.i = 0;
    renderFlip(true);
  }
  function renderFlip(soft) {
    const face = $('#fcFace'), p = F.list[F.i];
    if (!p) { face.innerHTML = `<div class="empty" style="padding:18px 0"><b>The market is quiet.</b></div>`; F.built = false; return; }
    if (!F.built) {
      face.innerHTML = `
        <div class="fc-id" id="fcId"></div>
        <div class="fc-big"><b id="fcY"></b><span>a day</span></div>
        <div class="fc-grid"><div><span>Pool · SOL</span><b id="fcTvl"></b></div><div><span>24h vol · SOL</span><b id="fcVol"></b></div><div><span>Trades 24h</span><b id="fcTx"></b></div></div>
        <div class="fc-foot"><span>1 SOL earns <b id="fcEarn"></b> SOL a day</span><button class="btn grass sm" type="button" id="fcGo">Plant</button></div>`;
      F.built = true;
    }
    const id = $('#fcId');
    const html = `${tokImg(p)}<div class="fc-nm"><b>${esc(p.name || short(p.mint))}</b><small>${label(p)}${p.created ? ' · ' + age(p.created) + ' old' : ''}</small></div><span class="fc-chg ${p.change24 >= 0 ? 'up' : 'down'}">${p.change24 >= 0 ? '+' : ''}${(+p.change24).toFixed(1)}%</span>`;
    if (soft && id.dataset.pool === p.pool) id.innerHTML = html;
    else { id.classList.remove('in'); void id.offsetWidth; id.innerHTML = html; id.classList.add('in'); }
    id.dataset.pool = p.pool;
    odo($('#fcY'), (p.yieldDay * 100).toFixed(2) + '%');
    odo($('#fcTvl'), nfmt(p.tvlSol)); odo($('#fcVol'), nfmt(p.volSol)); odo($('#fcTx'), p.txns24 ? nfmt(p.txns24) : '0');
    odo($('#fcEarn'), tiny(p.yieldDay));
    $('#fcIdx').textContent = (F.i + 1) + '/' + F.list.length;
    if (!soft) { const pr = $('#fcProg'); pr.style.animation = 'none'; void pr.offsetWidth; pr.style.animation = ''; }
  }
  const flipTo = d => { if (!F.list.length) return; F.i = (F.i + d + F.list.length) % F.list.length; renderFlip(false); };
  $('#fcPrev').addEventListener('click', () => flipTo(-1));
  $('#fcNext').addEventListener('click', () => flipTo(1));
  $('#fcProg').addEventListener('animationend', () => flipTo(1));
  $('#flip').addEventListener('click', e => { if (e.target.closest('#fcGo, .fc-id')) { const p = F.list[F.i]; if (p) openPool(p.pool); } });
  let fx0 = null;
  $('#flip').addEventListener('touchstart', e => { fx0 = e.touches[0].clientX; }, { passive: true });
  $('#flip').addEventListener('touchend', e => { if (fx0 == null) return; const dx = e.changedTouches[0].clientX - fx0; fx0 = null; if (Math.abs(dx) > 40) flipTo(dx < 0 ? 1 : -1); });
  function tickUpdated() {
    const el = $('#updated span'); if (!S.updated) return;
    const s = Math.round((Date.now() - S.updated) / 1000);
    el.textContent = 'Live · updated ' + (s < 5 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago');
  }
  setInterval(tickUpdated, 1000);
  async function loadPools(quiet) {
    if (!quiet) $('#rows').innerHTML = '<div class="skel"></div>'.repeat(6);
    try {
      const j = await api('pools');
      S.pools = j.pools || []; S.updated = j.updated || Date.now();
      renderPools(); renderStats(); flipList(); renderTicker(); calcPools(); liveFarms(); tickUpdated();
    } catch (e) {
      if (quiet) return;
      $('#rows').innerHTML = `<div class="empty">${ART}<b>Could not reach the market.</b><button class="btn sm" id="retry" type="button" style="margin-top:10px">Retry</button></div>`;
      $('#retry').onclick = () => loadPools();
      $('#updated span').textContent = 'Offline'; $('#kickN').textContent = 'Market offline';
      $('#fcFace').innerHTML = `<div class="empty" style="padding:18px 0"><b>Market offline.</b>Retrying in a minute.</div>`; F.built = false;
    }
  }
  setInterval(() => { if (!document.hidden && !S.busy) loadPools(true); }, 60000);
  $('#rows').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) openPool(r.dataset.pool); });
  $('#th').addEventListener('click', e => { const b = e.target.closest('.sort'); if (!b) return; S.sort = b.dataset.s; $$('#th .sort').forEach(x => x.classList.toggle('on', x === b)); renderPools(); });
  $('#size').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.min = +b.dataset.m; $$('#size button').forEach(x => x.classList.toggle('on', x === b)); renderPools(); });
  $('#q').addEventListener('input', e => { S.q = e.target.value; renderPools(); });
  $('#find').addEventListener('submit', e => {
    e.preventDefault(); const v = $('#findIn').value.trim(); if (!v) return;
    if (isAddr(v)) { openPool(v); return; }
    S.q = v; $('#q').value = v; S.min = 0; $$('#size button').forEach(x => x.classList.toggle('on', x.dataset.m === '0')); renderPools();
    document.getElementById('farms').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- the farm drawer ---------- */
  function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#veil').hidden = false; document.documentElement.style.overflow = 'hidden'; }
  function closeDrawer() { if (S.busy) return; $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#veil').hidden = true; document.documentElement.style.overflow = ''; S.pool = null; }
  $('#dClose').addEventListener('click', closeDrawer); $('#veil').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#wModal').hidden) $('#wModal').hidden = true; else if (S.pool) closeDrawer(); } });

  async function openPool(id, quiet, tab, amt) {
    if (!quiet) { S.pool = { pool: id, loading: true }; S.tab = tab || 'add'; S.amt = amt || ''; S.st = null; renderDrawer(); openDrawer(); }
    try {
      const j = await api('pool?id=' + encodeURIComponent(id) + (W.acct ? '&user=' + W.acct.address : ''));
      if (S.pool && (S.pool.pool === id || S.pool.mint === id || S.pool.pool === j.pool.pool || quiet)) { S.pool = j.pool; renderDrawer(); }
    } catch (e) {
      if (!quiet) { S.pool = { pool: id, error: e.message }; renderDrawer(); }
    }
  }
  // the same split the server does: buy b of the coin, deposit both sides, nothing left over
  function estimate(p, solIn) {
    try {
      const lamports = BigInt(Math.floor(solIn * 1e9)); if (lamports <= 0n) return null;
      const fee = BigInt(S.cfg.feeBps || 0); const cut = lamports * fee / 10000n; const budget = lamports - cut;
      const Rb = BigInt(p.reserves.coin), Rq = BigInt(p.reserves.solLamports), L = BigInt(p.lpSupply), vq = BigInt(p.reserves.vqr || '0');
      const f = p.feeBps, cd = (a, b) => (a + b - 1n) / b;
      const cost = b => { const q = cd((Rq + vq) * b, Rb - b); const g = bp => cd(q * BigInt(bp), 10000n); return { q, lf: g(f.lp), t: q + g(f.lp) + g(f.protocol) + g(f.creator) }; };
      let lo = 0n, hi = Rb / 2n;
      for (let i = 0; i < 90 && hi - lo > 1n; i++) { const m = (lo + hi) / 2n, c = cost(m); if (c.t >= budget) { hi = m; continue; } const D = budget - c.t; if (m * (Rq + c.q + c.lf) < D * (Rb - m)) lo = m; else hi = m; }
      const c = cost(lo), D = budget - c.t, Rq2 = Rq + c.q + c.lf, Rb2 = Rb - lo;
      let lp = lo * L / Rb2; const lq = D * L / Rq2; if (lq < lp) lp = lq;
      const share = Number(lp) / Number(L + lp);
      const value = share * 2 * Number(Rq2 + D) / 1e9;
      return { cut: Number(cut) / 1e9, swap: Number(c.t) / 1e9, coin: Number(lo), dep: Number(D) / 1e9, share, value, day: share * p.volSol * p.lpBps / 10000 };
    } catch (e) { return null; }
  }
  function priceTable(V, v, sym) {
    return `<p><b>If the price moves</b> before you harvest, your farm changes like this, before any fees earned:</p><table><tr><th>${esc(sym)} moves</th><th>Your farm</th><th>vs. ${fsol(v)} SOL in</th></tr>${[[-75, 0.25], [-50, 0.5], [100, 2], [300, 4]].map(([pc, r]) => { const lp = V * Math.sqrt(r), d = lp / v - 1; return `<tr><td>${pc > 0 ? '+' : ''}${pc}%</td><td>${fsol(lp)} SOL</td><td class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%</td></tr>`; }).join('')}</table>`;
  }
  function renderDrawer() {
    const p = S.pool, el = $('#dIn'); if (!p) return;
    if (p.loading) { el.innerHTML = `<div class="d-top"><span class="tok"></span><div><h3>Finding the farm…</h3><small><span class="loader"></span>Reading PumpSwap on-chain</small></div></div><div class="skel" style="margin-top:20px;border-radius:6px"></div>`; return; }
    if (p.error) { el.innerHTML = `<div class="empty">${ART}<b>${esc(p.error)}</b><button class="btn sm" type="button" id="dBack">Back to the farms</button></div>`; $('#dBack').onclick = closeDrawer; return; }
    const sym = p.symbol ? '$' + p.symbol : 'the coin';
    const you = p.you, hasPos = you && BigInt(you.lp || '0') > 0n, hasCoin = you && BigInt(you.coin || '0') > 0n;
    const f = p.feeBps || { lp: p.lpBps, protocol: 0, creator: 0 };
    if (!['add', 'pair', 'remove'].includes(S.tab)) S.tab = 'add';
    el.innerHTML = `
      <div class="d-top">${tokImg(p)}<div><h3>${esc(p.name || short(p.mint))}</h3>
        <small>${p.symbol ? esc('$' + p.symbol) + ' · ' : ''}<a href="https://solscan.io/account/${esc(p.pool)}" target="_blank" rel="noopener">pool ${short(p.pool)}</a> · <a href="https://dexscreener.com/solana/${esc(p.pool)}" target="_blank" rel="noopener">chart</a> · <a href="https://pump.fun/coin/${esc(p.mint)}" target="_blank" rel="noopener">pump.fun</a></small></div></div>
      <div class="kv">
        <div class="hl"><span>Yield / day</span><b>${p.volSol ? pctTxt(p.yieldDay) : '—'}</b></div>
        <div><span>Pool size</span><b>${compact(p.tvlSol)} SOL</b></div>
        <div><span>24h volume</span><b>${p.volSol ? compact(p.volSol) + ' SOL' : '—'}</b></div>
        <div><span>Market cap</span><b>${compact(p.mcapSol)} SOL</b></div>
      </div>
      <p class="feeline">Each trade pays ${((f.lp + f.protocol + f.creator) / 100).toFixed(2)}%: <b>${(f.lp / 100).toFixed(2)}% to this farm's LPs</b>, ${(f.protocol / 100).toFixed(2)}% to PumpSwap, ${(f.creator / 100).toFixed(2)}% to the coin's creator.</p>
      ${hasPos ? `<div class="you"><span>Your farm: <b>${fsol(you.valueSol)} SOL</b> · ${pctTxt(you.share, 3)} of the pool · about ${fsol(you.share * p.volSol * p.lpBps / 10000)} SOL a day</span></div>` : ''}
      ${!p.solPool ? `<div class="status show err">This pool is not paired with SOL. AFK handles SOL pools only for now.</div>` : `
      <div class="tabs"><button type="button" data-t="add" class="${S.tab === 'add' ? 'on' : ''}">Plant</button><button type="button" data-t="pair" class="${S.tab === 'pair' ? 'on' : ''}">Pair coins</button><button type="button" data-t="remove" class="${S.tab === 'remove' ? 'on' : ''}">Harvest</button></div>
      <div id="pane"></div>`}
      <div class="status" id="st"></div>
      <div class="d-trades" id="dTr"><div class="dt-head"><span>Last trades</span><em id="dTrU"><i class="pulse"></i>live</em></div><div class="dt-list" id="dTrL"><div class="skel-line w80"></div><div class="skel-line w60"></div></div></div>`;
    drawerTrades(p);
    if (S.st && S.st.pool === p.pool && S.st.tab === S.tab) { const st = $('#st'); st.className = S.st.cls; st.innerHTML = S.st.html; }
    $$('.tabs button', el).forEach(b => b.onclick = () => { if (S.busy) return; S.tab = b.dataset.t; S.st = null; renderDrawer(); });
    if (p.solPool) { if (S.tab === 'add') paneAdd(p, sym); else if (S.tab === 'pair') panePair(p, sym, hasCoin); else paneRemove(p, sym); }
  }
  const slipChips = () => `<div class="slip"><span>Max price move</span><div class="chips" id="slip">${[1, 2, 5].map(v => `<button class="chip ${S.slip === v ? 'on' : ''}" type="button" data-v="${v}">${v}%</button>`).join('')}</div></div>`;
  const bindSlip = () => { $('#slip').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.slip = +b.dataset.v; $$('#slip .chip').forEach(x => x.classList.toggle('on', x === b)); }; };
  function paneAdd(p, sym) {
    const bal = p.you ? p.you.sol : null;
    $('#pane').innerHTML = `
      <div class="field"><div class="row1"><span>You plant</span>${bal != null ? `<button type="button" id="max">Balance ${fsol(bal)} SOL</button>` : ''}</div>
        <div class="row2"><input id="amt" inputmode="decimal" placeholder="0.0" aria-label="SOL amount" value="${esc(S.amt)}"><span class="unit">SOL</span></div></div>
      <div class="chips" id="quick">${[0.1, 0.5, 1, 5].map(v => `<button class="chip" type="button" data-v="${v}">${v} SOL</button>`).join('')}</div>
      ${slipChips()}
      <div class="prev" id="prev"></div>
      <div class="sim" id="sim" hidden></div>
      <button class="btn grass go" id="goAdd" type="button">${W.w ? 'Plant and go AFK' : 'Connect wallet'}</button>
      <p class="fine">Your wallet signs. LP tokens go to your wallet.</p>`;
    const amt = $('#amt');
    const upd = () => {
      S.amt = amt.value;
      const v = parseFloat(amt.value.replace(',', '.'));
      const e = v > 0 ? estimate(p, v) : null;
      const dec = p.decimals || 6;
      $('#prev').innerHTML = e ? `
        ${e.cut ? `<div><span>AFK fee (${(S.cfg.feeBps / 100).toFixed(1)}%)</span><b>${fsol(e.cut, 4)} SOL</b></div>` : ''}
        <div><span>Swapped for ${esc(sym)}</span><b>${fsol(e.swap)} SOL → ${compact(e.coin / Math.pow(10, dec))}</b></div>
        <div><span>Added to the pool</span><b>${fsol(e.dep)} SOL + ${compact(e.coin / Math.pow(10, dec))}</b></div>
        <div><span>Your share of the pool</span><b>${pctTxt(e.share, 3)}</b></div>
        <div class="hi"><span>At the last 24h pace</span><b>${p.volSol ? '≈ ' + fsol(e.day) + ' SOL / day' : '—'}</b></div>` : '';
      const sim = $('#sim');
      if (!e) { sim.hidden = true; return; }
      sim.hidden = false; sim.innerHTML = priceTable(e.value, v, sym);
    };
    amt.addEventListener('input', upd); upd();
    $('#quick').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; amt.value = b.dataset.v; upd(); };
    bindSlip();
    const mx = $('#max'); if (mx) mx.onclick = () => { amt.value = Math.max(0, bal - 0.012).toFixed(3); upd(); };
    $('#goAdd').onclick = async () => {
      if (needWallet()) return;
      const v = parseFloat(amt.value.replace(',', '.'));
      if (!(v >= 0.01)) { toast('Enter at least 0.01 SOL'); amt.focus(); return; }
      await run('add', { kind: 'add', pool: p.pool, user: W.acct.address, sol: v, slippage: S.slip }, q => `Adds ${fsol(q.depositSol)} SOL + ${compact(coinAmt(q.depositCoin, q.decimals))} ${esc(sym)} · ${pctTxt(q.share, 3)} of the pool`, '#goAdd');
    };
  }
  function panePair(p, sym, hasCoin) {
    if (!W.w) { $('#pane').innerHTML = `<div class="empty" style="padding:24px 8px"><b>Connect to pair the coins you hold.</b><button class="btn sm grass" id="cw" type="button" style="margin-top:10px">Connect wallet</button></div>`; $('#cw').onclick = connect; return; }
    if (!hasCoin) { $('#pane').innerHTML = `<div class="empty" style="padding:24px 8px"><b>This wallet holds no ${esc(sym)}.</b>Use Plant to start from SOL instead.</div>`; return; }
    const dec = p.decimals || 6, coins = coinAmt(p.you.coin, dec);
    const solNeed = p.reserves && p.reserves.coin ? coins * Number(p.reserves.solLamports) / Number(p.reserves.coin) / 1e0 / Math.pow(10, 9 - dec) : 0;
    $('#pane').innerHTML = `
      <div class="pair-box">You hold <b>${compact(coins)} ${esc(sym)}</b>. Pairing adds them to the pool with about <b>${fsol(solNeed)} SOL</b> of matching SOL, without buying more. If the wallet has less SOL than that, AFK pairs as much as it can.</div>
      ${slipChips()}
      <div class="prev"><div class="hi"><span>Your farm would hold about</span><b>${fsol(solNeed * 2)} SOL of value</b></div></div>
      <button class="btn grass go" id="goPair" type="button">Pair my coins</button>
      <p class="fine">Your wallet signs. LP tokens go to your wallet.</p>`;
    bindSlip();
    $('#goPair').onclick = () => run('add2', { kind: 'add2', pool: p.pool, user: W.acct.address, coin: 'max', slippage: S.slip }, q => `Adds ${fsol(q.depositSol)} SOL + ${compact(coinAmt(q.depositCoin, q.decimals))} ${esc(sym)} · ${pctTxt(q.share, 3)} of the pool`, '#goPair');
  }
  function paneRemove(p, sym) {
    const you = p.you, has = you && BigInt(you.lp || '0') > 0n;
    if (!W.w || !has) {
      $('#pane').innerHTML = `<div class="empty" style="padding:24px 8px">${W.w ? `<b>Nothing planted here yet.</b>Plant some first, then come back to harvest.` : `<b>Connect to see your farm.</b><button class="btn sm grass" id="cw" type="button" style="margin-top:10px">Connect wallet</button>`}</div>`;
      const cw = $('#cw'); if (cw) cw.onclick = connect; return;
    }
    $('#pane').innerHTML = `
      <div class="chips" id="pcts">${[25, 50, 75, 100].map(v => `<button class="chip ${S.pct === v ? 'on' : ''}" type="button" data-v="${v}">${v}%</button>`).join('')}</div>
      <label class="toggle"><span>Get it all back as SOL</span><span class="sw"><input type="checkbox" id="toSol" ${S.toSol ? 'checked' : ''}><i></i></span></label>
      ${slipChips()}
      <div class="prev" id="prev"></div>
      <button class="btn gold go" id="goRm" type="button">Harvest</button>
      <p class="fine">Harvesting is free. Network fees only.</p>`;
    const upd = () => {
      const fr = S.pct / 100, dec = p.decimals || 6;
      const coin = coinAmt(you.coinInPool, dec) * fr, solv = you.solInPool * fr;
      $('#prev').innerHTML = S.toSol
        ? `<div><span>From the pool</span><b>${fsol(solv)} SOL + ${compact(coin)} ${esc(sym)}</b></div><div class="hi"><span>You get about</span><b>${fsol(solv * 2 * (1 - p.totalBps / 10000))} SOL</b></div>`
        : `<div class="hi"><span>You get about</span><b>${fsol(solv)} SOL + ${compact(coin)}</b></div>`;
    };
    upd();
    $('#pcts').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.pct = +b.dataset.v; $$('#pcts .chip').forEach(x => x.classList.toggle('on', x === b)); upd(); };
    $('#toSol').onchange = e => { S.toSol = e.target.checked; upd(); };
    bindSlip();
    $('#goRm').onclick = () => run('remove', { kind: 'remove', pool: p.pool, user: W.acct.address, pct: S.pct, toSol: S.toSol, slippage: S.slip }, q => q.toSol ? `Harvests ${q.pct}% and sells the coin side: about ${fsol(q.solOut + q.sellSol)} SOL` : `Harvests ${q.pct}%: about ${fsol(q.solOut)} SOL + ${compact(coinAmt(q.coinOut, q.decimals))} ${esc(sym)}`, '#goRm');
  }
  async function run(kind, body, describe, btnSel) {
    if (S.busy) return; S.busy = true;
    const st = $('#st'); const btn = $(btnSel); if (btn) btn.disabled = true;
    const steps = ['Build and simulate the transaction', 'Approve in your wallet', 'Confirm on Solana'];
    let line = '', sigs = [], idx = 0, total = 1;
    const draw = (cur, err) => {
      st.className = 'status show ' + (err ? 'err' : cur >= 3 ? 'ok' : 'wait');
      const links = sigs.map((s, i) => `<a href="https://solscan.io/tx/${s}" target="_blank" rel="noopener">${total > 1 ? 'Step ' + (i + 1) + ' on Solscan' : 'View on Solscan'}</a>`).join(' · ');
      st.innerHTML = (err ? `<b>${esc(err.message || err)}</b>${err.logs ? `<pre>${esc(err.logs.join('\n'))}</pre>` : ''}` : cur >= 3 ? `<b>Done. ${kind === 'remove' ? 'Harvested to your wallet.' : 'Your farm is planted. Go AFK.'}</b>` : `<b><span class="loader"></span>${esc(line || 'Working…')}</b>`)
        + (!err && cur < 3 ? `<ol>${steps.map((t, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${i < cur ? '✓ ' : ''}${t}${i === 2 && total > 1 ? ` (${Math.min(idx + 1, total)} of ${total})` : ''}</li>`).join('')}</ol>` : '')
        + (links ? `<div style="margin-top:8px">${links}</div>` : '');
      S.st = { pool: body.pool, tab: S.tab, cls: st.className, html: st.innerHTML };
    };
    try {
      line = 'Checking the pool and simulating…'; draw(0);
      const r = await api('tx', body);
      total = r.txs.length; line = describe(r.quote) + (total > 1 ? ' · two signatures' : ''); draw(1);
      await signSend(r.txs, (what, s, i) => { if (s) sigs = s.slice(); if (i != null) idx = i; draw(what === 'sign' ? 1 : 2); });
      draw(3); toast(kind === 'remove' ? 'Harvested.' : 'Planted. Go AFK.');
      setTimeout(() => { if (S.pool && S.pool.pool) openPool(S.pool.pool, true); loadPositions(); }, 1500);
    } catch (e) {
      const msg = /reject|denied|cancel/i.test(e && e.message || '') ? new Error('You cancelled in the wallet. Nothing was sent.') : e;
      draw(0, msg);
    } finally { S.busy = false; if (btn) btn.disabled = false; }
  }

  /* ---------- my farms ---------- */
  function renderPositions() {
    const box = $('#pos'); $('#refreshPos').hidden = !W.w;
    if (!W.w) { box.innerHTML = `<div class="connect-card">${ART}<div><h3>Every farm you hold, in one place</h3><p>Connect to see every pool you're in, what it's worth and what it earns a day.</p></div><button class="btn grass" id="cw2" type="button">Connect wallet</button></div>`; $('#cw2').onclick = connect; return; }
    if (S.positions == null) { box.innerHTML = '<div class="skel" style="border-radius:8px;border:0"></div>'; return; }
    if (S.positions.error) { box.innerHTML = `<div class="connect-card"><p>${esc(S.positions.error)}</p><button class="btn sm" id="rp" type="button">Retry</button></div>`; $('#rp').onclick = loadPositions; return; }
    if (!S.positions.length) { box.innerHTML = `<div class="connect-card">${ART}<div><h3>No farms yet</h3><p>Plant on any farm and it shows up here.</p></div><a class="btn grass" href="#farms">See the farms</a></div>`; return; }
    const tot = S.positions.reduce((a, p) => a + p.valueSol, 0), day = S.positions.reduce((a, p) => a + (p.earnDaySol || 0), 0);
    box.innerHTML = `<div class="pos-grid">
      <div class="pcard total"><span class="c-farm"><span class="nm"><b>All farms</b><small>${S.positions.length} pool${S.positions.length > 1 ? 's' : ''}</small></span></span><span><span class="lbl">Value</span><span class="val">${fsol(tot)} SOL</span></span><span><span class="lbl">Per day</span><span class="val">≈ ${fsol(day)} SOL</span></span><span></span><span></span></div>
      ${S.positions.map(p => `
      <div class="pcard"><span class="c-farm">${tokImg(p)}<span class="nm"><b>${esc(p.name || short(p.mint))}</b><small>${label(p)}</small></span></span>
        <span><span class="lbl">Value</span><span class="val">${fsol(p.valueSol)} SOL</span></span>
        <span><span class="lbl">Share</span><span class="val">${pctTxt(p.share, 3)}</span></span>
        <span><span class="lbl">Per day</span><span class="val">${p.volSol ? '≈ ' + fsol(p.earnDaySol) : '—'}</span></span>
        <span class="acts"><button class="btn sm grass" data-a="add" data-pool="${esc(p.pool)}" type="button">Plant</button><button class="btn sm gold" data-a="remove" data-pool="${esc(p.pool)}" type="button">Harvest</button></span></div>`).join('')}</div>`;
  }
  $('#pos').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; openPool(b.dataset.pool, false, b.dataset.a); });
  $('#refreshPos').addEventListener('click', loadPositions);
  async function loadPositions() {
    if (!W.w) return renderPositions();
    S.positions = null; renderPositions();
    try { const j = await api('positions?user=' + W.acct.address); S.positions = j.positions; }
    catch (e) { S.positions = { error: e.message }; }
    renderPositions();
  }

  /* ---------- ticker + calculator ---------- */
  function renderTicker() {
    const list = S.pools.filter(p => p.tvlSol >= 25).sort((a, b) => b.yieldDay - a.yieldDay).slice(0, 18);
    if (!list.length) return;
    const one = list.map(p => `<span class="tk-item" data-pool="${esc(p.pool)}"><img src="/img/coin.png" alt=""><b>${esc(p.symbol ? '$' + p.symbol : short(p.mint))}</b><em>${pctTxt(p.yieldDay, 1)}</em>a day · ${compact(p.tvlSol)} SOL pool</span>`).join('');
    $('#ticker').innerHTML = one + one; $('#tickerBox').hidden = false;
  }
  $('#ticker').addEventListener('click', e => { const t = e.target.closest('[data-pool]'); if (t) openPool(t.dataset.pool); });

  const AMTS = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  const C = { list: [], p: null, amt: 1 };
  function calcPools() {
    C.list = S.pools.filter(p => p.tvlSol >= 25).sort((a, b) => b.yieldDay - a.yieldDay).slice(0, 30);
    if (!C.list.length) C.list = S.pools.slice(0, 30);
    if (!C.p || !C.list.some(p => p.pool === C.p.pool)) C.p = C.list[0] || null;
    else C.p = C.list.find(p => p.pool === C.p.pool);
    $('#cList').innerHTML = C.list.map(p => `<button type="button" role="option" data-pool="${esc(p.pool)}" class="${C.p && p.pool === C.p.pool ? 'on' : ''}">${tokImg(p)}<b>${esc(p.name || short(p.mint))}</b><em>${pctTxt(p.yieldDay, 1)}</em></button>`).join('');
    const top = C.list.slice(0, 6), mx = Math.max(...top.map(p => p.yieldDay), 1e-9);
    $('#cQuick').innerHTML = top.map(p => `<button type="button" data-pool="${esc(p.pool)}" class="${C.p && p.pool === C.p.pool ? 'on' : ''}">${tokImg(p)}<b>${label(p)}</b><span class="mbar"><i style="width:${Math.max(4, Math.round(p.yieldDay / mx * 100))}%"></i></span><em>${pctTxt(p.yieldDay, 2)}</em></button>`).join('');
    calcRender();
  }
  $('#cQuick').addEventListener('click', e => { const b = e.target.closest('[data-pool]'); if (!b) return; C.p = C.list.find(p => p.pool === b.dataset.pool); $$('#cQuick button').forEach(x => x.classList.toggle('on', x === b)); $$('#cList button').forEach(x => x.classList.toggle('on', x.dataset.pool === b.dataset.pool)); calcRender(); });
  function calcRender() {
    const p = C.p, v = C.amt;
    $('#cCur').innerHTML = p ? `${tokImg(p)}<span class="t">${esc(p.name || short(p.mint))}<small>${label(p)} · ${compact(p.tvlSol)} SOL pool · ${pctTxt(p.yieldDay, 1)} a day</small></span>` : 'No farms loaded';
    $('#cAmtV').textContent = v + ' SOL';
    if (!p || !(v > 0)) { odo($('#cDay'), '0'); ['#cWeek', '#cMonth', '#cShare'].forEach(id => odo($(id), '0')); $('#cSim').innerHTML = ''; return; }
    const dep = v * (1 - (S.cfg.feeBps || 0) / 1e4) * (1 - p.totalBps / 2e4);
    const share = dep / (p.tvlSol + dep), day = share * p.volSol * p.lpBps / 1e4;
    odo($('#cDay'), tiny(day)); odo($('#cWeek'), tiny(day * 7)); odo($('#cMonth'), tiny(day * 30)); odo($('#cShare'), (share * 100).toFixed(share < 0.001 ? 4 : 3) + '%');
    const sym = p.symbol ? '$' + p.symbol : 'the coin';
    $('#cSim').innerHTML = priceTable(dep, v, sym);
  }
  const range = $('#cRange');
  range.max = AMTS.length - 1; range.value = AMTS.indexOf(1);
  const paintRange = () => range.style.setProperty('--f', (range.value / range.max * 100) + '%');
  $$('.range-ticks span').forEach(t => { const i = AMTS.indexOf(+t.textContent); t.style.left = `calc(11px + (100% - 22px) * ${i / (AMTS.length - 1)})`; t.onclick = () => { range.value = i; range.dispatchEvent(new Event('input')); }; });
  range.addEventListener('input', () => { C.amt = AMTS[+range.value] || 1; paintRange(); calcRender(); });
  paintRange();
  const pickClose = () => { $('#cList').hidden = true; $('#cPick').classList.remove('open'); };
  $('#cPickBtn').addEventListener('click', e => { e.stopPropagation(); const open = $('#cList').hidden; $('#cList').hidden = !open; $('#cPick').classList.toggle('open', open); });
  $('#cList').addEventListener('click', e => { const b = e.target.closest('[data-pool]'); if (!b) return; C.p = C.list.find(p => p.pool === b.dataset.pool); $$('#cList button').forEach(x => x.classList.toggle('on', x === b)); $$('#cQuick button').forEach(x => x.classList.toggle('on', x.dataset.pool === b.dataset.pool)); pickClose(); calcRender(); });
  document.addEventListener('click', e => { if (!e.target.closest('#cPick')) pickClose(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pickClose(); });

  /* ---------- live trades: real swaps from the pool, newest first ---------- */
  const L = { farms: [], pool: null, seen: new Set(), trades: [], ok: 0, err: false, busy: false, inView: false, timer: 0 };
  const ago = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };
  function liveFarms() {
    const list = S.pools.filter(p => p.tvlSol >= 25 && p.volSol > 0).sort((a, b) => (b.txns24 || b.volSol) - (a.txns24 || a.volSol)).slice(0, 6);
    if (!list.length) return;
    const keep = L.pool && list.some(p => p.pool === L.pool);
    L.farms = list;
    if (!keep) L.pool = list[0].pool;
    $('#liveTabs').innerHTML = list.map(p => `<button type="button" role="tab" data-pool="${esc(p.pool)}" class="${p.pool === L.pool ? 'on' : ''}" aria-selected="${p.pool === L.pool}">${tokImg(p)}<b>${label(p)}</b></button>`).join('');
    if (!keep) liveSwitch(L.pool);
  }
  $('#liveTabs').addEventListener('click', e => { const b = e.target.closest('[data-pool]'); if (!b || b.dataset.pool === L.pool) return; $$('#liveTabs button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); liveSwitch(b.dataset.pool); });
  function liveSwitch(pool) {
    L.pool = pool; L.seen = new Set(); L.trades = []; L.err = false;
    $('#feed').innerHTML = '<div class="skel-line w80"></div><div class="skel-line w60"></div><div class="skel-line w80"></div>';
    ['#lsN', '#lsFee', '#lsYou'].forEach(id => odo($(id), '0'));
    liveLoad();
  }
  const farmOf = pool => S.pools.find(p => p.pool === pool) || {};
  async function liveLoad() {
    if (!L.pool || L.busy) return; L.busy = true;
    const pool = L.pool;
    try {
      const j = await api('trades?pool=' + encodeURIComponent(pool));
      if (pool !== L.pool) return;
      L.err = false; L.ok = Date.now();
      liveRender(j.trades || []);
    } catch (e) {
      if (pool !== L.pool) return;
      L.err = true;
      if (!L.trades.length) $('#feed').innerHTML = `<div class="feed-empty"><b>Trade feed offline.</b>Retrying in a few seconds. No trades are shown until real ones load.</div>`;
    } finally { L.busy = false; liveTick(); }
  }
  function liveRender(list) {
    const p = farmOf(L.pool), bps = p.lpBps || 0;
    const fresh = list.filter(t => !L.seen.has(t.tx + t.t + t.sol));
    const first = !L.trades.length;
    list.forEach(t => L.seen.add(t.tx + t.t + t.sol));
    L.trades = list;
    if (!list.length) { $('#feed').innerHTML = `<div class="feed-empty"><b>No trades in the last few minutes.</b>New ones land here as they happen.</div>`; }
    else {
      const freshSet = new Set(fresh.map(t => t.tx + t.t + t.sol));
      $('#feed').innerHTML = list.slice(0, 12).map((t, i) => {
        const fee = t.sol * bps / 1e4, isNew = freshSet.has(t.tx + t.t + t.sol);
        return `<a class="trow ${t.kind === 'sell' ? 'sell' : 'buy'}${isNew ? ' new' : ''}" style="animation-delay:${first ? i * 60 : 0}ms" href="https://solscan.io/tx/${esc(t.tx)}" target="_blank" rel="noopener">
          <span class="k">${t.kind === 'sell' ? 'SELL' : 'BUY'}</span>
          <b>${tiny(t.sol)} SOL</b>
          <em>+${tiny(fee)} to farmers</em>
          <time data-t="${t.t}">${ago(t.t)}</time></a>`;
      }).join('');
      if (!first && fresh.length) drop(fresh.slice(0, 5).map(t => t.sol * bps / 1e4));
    }
    const fees = list.reduce((a, t) => a + t.sol * bps / 1e4, 0);
    const tvl = p.tvlSol || 0;
    odo($('#lsN'), nfmt(list.length));
    odo($('#lsFee'), tiny(fees));
    odo($('#lsYou'), tiny(tvl ? fees / (tvl + 1) : 0));
    if (first && list.length) drop(list.slice(0, 4).map(t => t.sol * bps / 1e4));
  }
  function drop(fees) {
    const box = $('#drops');
    fees.forEach((f, i) => setTimeout(() => {
      const d = document.createElement('span'); d.className = 'drop';
      d.style.left = (18 + Math.random() * 64) + '%';
      d.innerHTML = `<img src="/img/coin.png" alt=""><em>+${tiny(f)}</em>`;
      d.addEventListener('animationend', () => d.remove());
      box.appendChild(d);
      const ch = $('.m-chest'); ch.classList.remove('hit'); void ch.offsetWidth; ch.classList.add('hit');
    }, i * 420));
  }
  function liveTick() {
    $$('#feed time').forEach(t => { t.textContent = ago(+t.dataset.t); });
    const el = $('#liveUpd span');
    if (L.err) { el.textContent = 'Feed offline · retrying'; $('#liveUpd').classList.add('off'); return; }
    $('#liveUpd').classList.remove('off');
    if (!L.ok) return;
    const s = Math.round((Date.now() - L.ok) / 1000);
    const span = L.trades.length > 1 ? ' · last ' + ago(L.trades[L.trades.length - 1].t) : '';
    el.textContent = 'Live' + span + ' · updated ' + (s < 3 ? 'now' : s + 's ago');
  }
  setInterval(liveTick, 1000);
  setInterval(() => { if (!document.hidden && L.inView) liveLoad(); }, 10000);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { es.forEach(e => { const was = L.inView; L.inView = e.isIntersecting; if (L.inView && !was && L.ok && Date.now() - L.ok > 9000) liveLoad(); }); }, { rootMargin: '200px' }).observe($('#live'));
  else L.inView = true;

  /* drawer: last trades for the open farm */
  const DT = { pool: null, list: null, t: 0, busy: false };
  function drawTrades(p) {
    const box = $('#dTrL'); if (!box) return;
    if (DT.pool !== p.pool || !DT.list) return;
    if (DT.list.err) { box.innerHTML = `<p class="dt-off">Trade feed offline right now.</p>`; return; }
    if (!DT.list.length) { box.innerHTML = `<p class="dt-off">No trades in the last few minutes.</p>`; return; }
    box.innerHTML = DT.list.slice(0, 6).map(t => `<a class="dt ${t.kind === 'sell' ? 'sell' : 'buy'}" href="https://solscan.io/tx/${esc(t.tx)}" target="_blank" rel="noopener"><span class="k">${t.kind === 'sell' ? 'SELL' : 'BUY'}</span><b>${tiny(t.sol)} SOL</b><em>+${tiny(t.sol * (p.lpBps || 0) / 1e4)}</em><time data-t="${t.t}">${ago(t.t)}</time></a>`).join('');
  }
  async function drawerTrades(p) {
    if (!p || !p.pool || !p.solPool) { const d = $('#dTr'); if (d) d.hidden = true; return; }
    if (DT.pool === p.pool && DT.list && Date.now() - DT.t < 10000) return drawTrades(p);
    if (DT.pool !== p.pool) DT.list = null;
    DT.pool = p.pool; drawTrades(p);
    if (DT.busy) return; DT.busy = true;
    try { const j = await api('trades?pool=' + encodeURIComponent(p.pool)); if (DT.pool === p.pool) { DT.list = j.trades || []; DT.t = Date.now(); } }
    catch (e) { if (DT.pool === p.pool) { DT.list = Object.assign([], { err: true }); DT.t = Date.now(); } }
    finally { DT.busy = false; if (S.pool && S.pool.pool === p.pool) drawTrades(S.pool); }
  }
  setInterval(() => { if (S.pool && S.pool.pool && S.pool.solPool && !document.hidden) { $$('#dTrL time').forEach(t => { t.textContent = ago(+t.dataset.t); }); if (Date.now() - DT.t > 10000) drawerTrades(S.pool); } }, 1000);
  $('#cGo').addEventListener('click', () => { if (C.p) openPool(C.p.pool, false, 'add', String(C.amt)); });

  /* ---------- config + nav ---------- */
  async function loadConfig() {
    try {
      S.cfg = await api('config');
      const xh = S.cfg.x ? (String(S.cfg.x).startsWith('http') ? S.cfg.x : 'https://x.com/' + String(S.cfg.x).replace(/^@/, '')) : '';
      if (S.cfg.ca) {
        const ca = esc(S.cfg.ca);
        $('#caPill').innerHTML = `<span class="ca-l">$AFK</span><code>${short(S.cfg.ca)}</code><button type="button" id="caCopy">Copy</button><a href="https://pump.fun/coin/${ca}" target="_blank" rel="noopener">Buy</a><a href="https://dexscreener.com/solana/${ca}" target="_blank" rel="noopener">Chart</a>${xh ? `<a href="${esc(xh)}" target="_blank" rel="noopener">X</a>` : ''}`;
        $('#caPill').hidden = false;
        $('#caCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(S.cfg.ca).then(() => toast('Address copied')); };
      }
      $('#footLinks').innerHTML = (xh ? `<a href="${esc(xh)}" target="_blank" rel="noopener">X</a>` : '') + (S.cfg.ca ? `<a href="https://dexscreener.com/solana/${esc(S.cfg.ca)}" target="_blank" rel="noopener">Chart</a>` : '') + `<a href="#faq">FAQ</a>`;
      if (S.cfg.feeBps) $('#feeFaq').innerHTML = `${(S.cfg.feeBps / 100).toFixed(1)}% of each plant goes to AFK${S.cfg.jug ? ` (<code>${esc(S.cfg.jug)}</code>)` : ''}. Harvesting is free. You also pay Solana network fees and a small, refundable rent for new token accounts.`;
    } catch (e) { S.cfg = { feeBps: 0 }; $('#footLinks').innerHTML = `<a href="#faq">FAQ</a>`; }
  }
  const nav = $('#nav'), hero = $('#top');
  const onScroll = () => {
    nav.classList.toggle('top', window.scrollY < hero.offsetHeight - 80);
    let cur = null; for (const a of $$('#links a')) { const s = document.getElementById(a.getAttribute('href').slice(1)); if (s && s.getBoundingClientRect().top < 160) cur = a; }
    $$('#links a').forEach(a => a.classList.toggle('on', a === cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const qp = new URLSearchParams(location.search).get('pool') || (isAddr(location.hash.slice(1)) ? location.hash.slice(1) : '');
  loadConfig().then(() => { loadPools(); renderPositions(); if (qp) openPool(qp); });
})();
