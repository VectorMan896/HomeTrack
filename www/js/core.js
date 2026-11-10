/* ============================================================
   HomeTrack — shared core
   State, storage, helpers, chart builders, modal, and the
   cross-module link that feeds power/water spend into Budget.
   ============================================================ */
window.HT = (function () {
  const STORE_KEY = 'hometrack.v1';
  const DAY = 86400000;
  const PALETTE = ['#34d399', '#3fb950', '#38bdf8', '#a78bfa', '#f472b6', '#fb7185',
                   '#f0a020', '#ffb703', '#22d3ee', '#94a3b8', '#f85149', '#64748b'];

  /* ---------- helpers ---------- */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  const t = (iso) => new Date(iso).getTime();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  function relTime(iso) {
    const d = (Date.now() - t(iso)) / DAY;
    if (d < 0) return 'scheduled';
    if (d < 0.021) return 'just now';
    if (d < 1) return Math.round(d * 24) + 'h ago';
    if (d < 1.5) return 'yesterday';
    return Math.round(d) + ' days ago';
  }
  function num(n, dec = 1) {
    if (n === Infinity) return '∞';
    if (n == null || isNaN(n)) return '–';
    return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function money(n, dec) {
    if (n === Infinity) return '∞';
    if (n == null || isNaN(n)) return '–';
    const d = dec != null ? dec : (Math.abs(n % 1) < 1e-9 ? 0 : 2);
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cur = () => state.settings.currency;

  /* ---------- default state / seeds ---------- */
  function seedAppliances() {
    const A = (name, watts, qty, hours, days, category) => ({ id: uid(), name, watts, qty, hours, days, category });
    return [
      A('Server PC', 150, 1, 24, 7, 'Always-on'), A('Gaming PC', 120, 1, 24, 7, 'Always-on'),
      A('Water heater (geyser)', 3000, 1, 2.3, 7, 'Heating'), A('Chest freezer', 150, 1, 9, 7, 'Refrigeration'),
      A('Fridge / freezer', 120, 2, 10, 7, 'Refrigeration'), A('Induction stove', 2000, 1, 0.8, 7, 'Cooking'),
      A('Electric kettle', 2000, 1, 0.15, 7, 'Cooking'), A('Microwave', 1000, 1, 0.3, 7, 'Cooking'),
      A('Water pressure pump', 750, 1, 1.2, 7, 'Pumps'), A('Elevation pressure pump', 750, 1, 1.5, 7, 'Pumps'),
      A('LED lamps', 9, 25, 5, 7, 'Lighting'), A('TV', 100, 1, 5, 7, 'Entertainment'),
      A('Washing machine', 500, 1, 1, 1.5, 'Laundry'), A('Pool pump', 1100, 1, 4, 0.3, 'Pumps')
    ];
  }
  function seedCategories() {
    const C = (name, type, budget, color, icon) => ({ id: uid(), name, type, budget, color, icon });
    return [
      C('Electricity', 'expense', 6000, '#ffb703', '⚡'), C('Water', 'expense', 0, '#38bdf8', '💧'),
      C('Groceries', 'expense', 0, '#3fb950', '🛒'), C('Rent', 'expense', 0, '#a78bfa', '🏠'),
      C('Transport / Fuel', 'expense', 0, '#f0a020', '🚗'), C('Airtime / Internet', 'expense', 0, '#f472b6', '📱'),
      C('Dining out', 'expense', 0, '#fb7185', '🍽'), C('Health', 'expense', 0, '#22d3ee', '💊'),
      C('Household', 'expense', 0, '#94a3b8', '🧴'), C('Other', 'expense', 0, '#64748b', '🔖'),
      C('Salary', 'income', 0, '#34d399', '💼'), C('M-Pesa in', 'income', 0, '#22d3ee', '📲'),
      C('Other income', 'income', 0, '#a78bfa', '➕')
    ];
  }
  function defaultState() {
    return {
      version: 1,
      settings: { currency: 'MT', notify: false, linkUtilities: true, theme: 'system', lang: 'en', reminders: { power: { on: false, time: '20:00' }, budget: { on: false, time: '21:00' } }, gen: { aspect: '2:3', model: '', steps: 20, batch: 2 }, sms: { enabled: true, lastScan: 0, importedSig: [], senders: [], pending: [] }, studio: { showHidden: false, host: '' } },
      power: {
        readings: [],
        recharges: [],
        appliances: [],
        settings: { alertKwh: 45, alertDays: 2, window: 7, assumed: 23.8 }
      },
      water: {
        readings: [],
        payments: [],
        settings: { ratePerM3: 35, fixed: 0, cycleDay: 1, window: 14, alertBill: 0, leakPerDay: 0 }
      },
      budget: {
        transactions: [],
        categories: seedCategories(),
        settings: { startingBalance: 0, balanceAt: 0, monthStartDay: 1, window: 7, lowBalance: 0, runwayDays: 5, overBudgetWarn: true }
      }
    };
  }

  /* ---------- load / save / migrate ---------- */
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return migrateLegacy() || defaultState();
      const s = JSON.parse(raw);
      return mergeDefaults(s);
    } catch (e) { console.error(e); return defaultState(); }
  }
  function mergeDefaults(s) {
    const d = defaultState();
    s.settings = Object.assign(d.settings, s.settings || {});
    ['power', 'water', 'budget'].forEach(k => {
      s[k] = s[k] || {};
      s[k].settings = Object.assign(d[k].settings, s[k].settings || {});
    });
    s.power.readings = s.power.readings || []; s.power.recharges = s.power.recharges || []; s.power.appliances = s.power.appliances || [];
    s.water.readings = s.water.readings || []; s.water.payments = s.water.payments || [];
    s.budget.transactions = s.budget.transactions || []; s.budget.categories = s.budget.categories || [];
    return s;
  }
  // If the user previously used the standalone PowerTracker/BudgetTracker, pull their data in once.
  function migrateLegacy() {
    try {
      const p = JSON.parse(localStorage.getItem('powertracker.v1') || 'null');
      const b = JSON.parse(localStorage.getItem('budgettracker.v1') || 'null');
      if (!p && !b) return null;
      const s = defaultState();
      if (p) { s.power.readings = p.readings || []; s.power.recharges = p.recharges || []; if (p.appliances) s.power.appliances = p.appliances; s.power.settings = Object.assign(s.power.settings, p.settings || {}); }
      if (b) { s.budget.transactions = b.transactions || []; if (b.categories) s.budget.categories = b.categories; s.budget.settings = Object.assign(s.budget.settings, b.settings || {}); }
      return s;
    } catch (e) { return null; }
  }
  // _updatedAt = when the data last really changed (used by cloud sync to pick the newer copy).
  // It's only bumped when the content differs, so routine saves (e.g. on boot) don't make a
  // stale device look "newest" and overwrite newer cloud data.
  const SYNC_KEYS = { _updatedAt: 1, _syncedAt: 1 };
  const contentSig = (s) => JSON.stringify(s, (k, v) => (SYNC_KEYS[k] ? undefined : v));
  if (state._syncedAt == null && state._updatedAt) state._syncedAt = state._updatedAt; // older installs: last push = last sync
  let lastSig = contentSig(state);
  function save() {
    const sig = contentSig(state);
    if (sig !== lastSig) { state._updatedAt = Date.now(); lastSig = sig; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save — storage full?'); }
  }
  // fromCloud: data came from the server, so keep its timestamps instead of stamping it as a local edit.
  function replaceState(newState, fromCloud) {
    state = mergeDefaults(newState);
    if (fromCloud) lastSig = contentSig(state);
    save(); applyTheme();
  }

  // Theme: 'system' (follow device) | 'light' | 'dark'
  function applyTheme() {
    const t = (state.settings && state.settings.theme) || 'system';
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  }
  applyTheme();

  /* ---------- cross-module link: utilities → budget ---------- */
  function budgetCatByName(name) { return state.budget.categories.find(c => c.name === name && c.type === 'expense'); }
  function linkExpense({ source, linkId, amount, categoryName, time, note }) {
    const cat = budgetCatByName(categoryName);
    const existing = state.budget.transactions.find(x => x.source === source && x.linkId === linkId);
    const data = { amount, categoryId: cat ? cat.id : null, type: 'expense', t: time, note, source, linkId, auto: true };
    if (existing) Object.assign(existing, data);
    else state.budget.transactions.push({ id: uid(), ...data });
  }
  function unlinkExpense(source, linkId) {
    state.budget.transactions = state.budget.transactions.filter(x => !(x.source === source && x.linkId === linkId));
  }
  // Drop budget entries whose power recharge / water payment no longer exists (after a module
  // reset or import). They can't be deleted from the Budget screen, so they'd otherwise stick forever.
  function pruneLinks(source, liveIds) {
    const live = new Set(liveIds);
    state.budget.transactions = state.budget.transactions.filter(x => x.source !== source || live.has(x.linkId));
  }

  /* ---------- toast / modal ---------- */
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2200);
  }
  function openModal(title, bodyHtml, onMount) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modal').classList.remove('hidden');
    if (onMount) onMount($('#modalBody'));
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modalBody').innerHTML = ''; }

  // Save a text file. On the phone (Capacitor) it writes to the app cache (always
  // writable) and opens the share sheet so you can save/send it; in a browser it
  // triggers a normal download.
  async function saveFile(filename, text, mime) {
    const cap = window.Capacitor;
    const native = cap && cap.isNativePlatform && cap.isNativePlatform();
    const FS = cap && cap.Plugins && cap.Plugins.Filesystem;
    const Sh = cap && cap.Plugins && cap.Plugins.Share;
    if (native && FS) {
      let uri = null;
      try {
        const res = await FS.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true });
        uri = res && res.uri;
      } catch (e) { toast('Export failed: ' + (e && e.message ? e.message : 'write error')); return false; }
      if (Sh && uri) {
        try { await Sh.share({ title: filename, url: uri, dialogTitle: 'Save or send ' + filename }); return true; }
        catch (e) { toast('Saved to app storage (share cancelled)'); return true; }
      }
      toast(uri ? 'Saved to app storage' : 'Export failed'); return !!uri;
    }
    // web fallback
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Downloaded ' + filename);
    return true;
  }

  /* ---------- chart builders (return SVG/HTML strings) ---------- */
  const CW = 340, CH = 160;
  function lineChart(series, opts = {}) {
    // series: [{t, y}] sorted; opts.marks: [t,...]
    if (!series || series.length < 2) return `<div class="empty">${opts.empty || 'Not enough data yet.'}</div>`;
    const pl = 38, pr = 12, pt = 12, pb = 24;
    const xs = series.map(s => t(s.t)), ys = series.map(s => s.y);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const yMax = Math.max(...ys) * 1.1 || 1, yMin = opts.yFromZero === false ? Math.min(...ys) * 0.95 : 0;
    const X = v => pl + (xMax === xMin ? 0.5 : (v - xMin) / (xMax - xMin)) * (CW - pl - pr);
    const Y = v => pt + (1 - (v - yMin) / (yMax - yMin || 1)) * (CH - pt - pb);
    let grid = '', ylab = '';
    for (let i = 0; i <= 3; i++) { const yv = yMin + (yMax - yMin) * i / 3, y = Y(yv); grid += `<line class="grid-line" x1="${pl}" y1="${y}" x2="${CW - pr}" y2="${y}"/>`; ylab += `<text class="axis-label" x="${pl - 5}" y="${y + 3}" text-anchor="end">${num(yv, 0)}</text>`; }
    const pts = series.map(s => `${X(t(s.t))},${Y(s.y)}`);
    const area = `<polygon class="plot-area" points="${X(xMin)},${Y(yMin)} ${pts.join(' ')} ${X(xMax)},${Y(yMin)}"/>`;
    const line = `<polyline class="plot-line" points="${pts.join(' ')}"/>`;
    const dots = series.map(s => `<circle class="plot-dot" cx="${X(t(s.t))}" cy="${Y(s.y)}" r="2.6"/>`).join('');
    let marks = '';
    (opts.marks || []).forEach(m => { if (m >= xMin && m <= xMax) marks += `<line class="recharge-mark" x1="${X(m)}" y1="${pt}" x2="${X(m)}" y2="${CH - pb}"/>`; });
    const xl = `<text class="axis-label" x="${pl}" y="${CH - 6}" text-anchor="start">${fmtDate(series[0].t)}</text><text class="axis-label" x="${CW - pr}" y="${CH - 6}" text-anchor="end">${fmtDate(series[series.length - 1].t)}</text>`;
    return `<svg viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid meet" role="img"><defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}${ylab}${marks}${area}${line}${dots}${xl}</svg>`;
  }
  function barChart(data, opts = {}) {
    // data: [{label, value, title}]
    if (!data || !data.length || !data.some(d => d.value > 0)) return `<div class="empty">${opts.empty || 'No data yet.'}</div>`;
    const pl = 34, pr = 10, pt = 12, pb = 26;
    const yMax = Math.max(...data.map(d => d.value)) * 1.15 || 1;
    const Y = v => pt + (1 - v / yMax) * (CH - pt - pb);
    const bw = (CW - pl - pr) / data.length;
    let grid = '', ylab = '';
    for (let i = 0; i <= 2; i++) { const yv = yMax * i / 2, y = Y(yv); grid += `<line class="grid-line" x1="${pl}" y1="${y}" x2="${CW - pr}" y2="${y}"/>`; ylab += `<text class="axis-label" x="${pl - 5}" y="${y + 3}" text-anchor="end">${num(yv, 0)}</text>`; }
    let bars = '', xl = '';
    data.forEach((d, i) => {
      const x = pl + i * bw + bw * 0.16, w = bw * 0.68, y = Y(d.value);
      bars += `<rect class="bar" x="${x}" y="${y}" width="${w}" height="${Math.max(0, CH - pb - y)}" rx="2"><title>${d.title || ''}</title></rect>`;
      if (i === 0 || i === data.length - 1 || data.length <= 8) xl += `<text class="axis-label" x="${x + w / 2}" y="${CH - 8}" text-anchor="middle">${d.label}</text>`;
    });
    let avgLine = '';
    if (opts.showAvg !== false) { const avg = data.reduce((s, d) => s + d.value, 0) / data.length; const ay = Y(avg); avgLine = `<line class="bar-avg" x1="${pl}" y1="${ay}" x2="${CW - pr}" y2="${ay}"/><text class="axis-label" x="${CW - pr}" y="${ay - 4}" text-anchor="end">avg ${num(avg, opts.avgDec != null ? opts.avgDec : 0)}</text>`; }
    return `<svg viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid meet" role="img">${grid}${ylab}${bars}${avgLine}${xl}</svg>`;
  }
  function hbars(rows) {
    if (!rows.length) return `<div class="empty">No data yet.</div>`;
    return rows.map(r => `<div class="hbar-row"><div class="hbar-ic">${escapeHtml(r.icon || '•')}</div><div class="hbar-body"><div class="hbar-top"><b>${escapeHtml(r.name)}</b><span>${r.right}</span></div><div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(0, Math.min(100, r.pct))}%;background:${r.color || 'var(--accent)'}"></div></div></div></div>`).join('');
  }
  const barColor = (pct) => pct >= 1 ? 'var(--bad)' : pct >= 0.8 ? 'var(--warn)' : 'var(--accent)';

  /* ---------- app came back to the foreground ---------- */
  // @capacitor/app isn't installed, so use what the WebView gives us: Capacitor's document
  // "resume" event plus visibilitychange (also works in a browser). Debounced since both can fire.
  const resumeFns = []; let lastResume = 0;
  function fireResume() { const n = Date.now(); if (n - lastResume < 1500) return; lastResume = n; resumeFns.forEach(f => { try { f(); } catch (e) { console.warn(e); } }); }
  document.addEventListener('resume', fireResume);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fireResume(); });
  function onResume(fn) { resumeFns.push(fn); }

  /* ---------- module registry ---------- */
  const modules = {};
  function register(name, mod) { modules[name] = mod; }

  /* ---------- notifications ---------- */
  function maybeNotify(tag, msg) {
    if (!state.settings.notify) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = 'hometrack.notify.' + tag, today = new Date().toDateString();
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
    try { new Notification('HomeTrack', { body: msg }); } catch (e) {}
  }

  return {
    STORE_KEY, DAY, PALETTE,
    uid, t, $, $$, toLocalInput, fmtDate, fmtDateTime, fmtDay, relTime, num, money, escapeHtml, cur,
    get state() { return state; }, save, replaceState, defaultState, applyTheme,
    budgetCatByName, linkExpense, unlinkExpense, pruneLinks,
    toast, openModal, closeModal, saveFile,
    lineChart, barChart, hbars, barColor,
    modules, register, maybeNotify, onResume
  };
})();
