/* ============================================================
   HomeTrack — boot: navigation, header, alerts, refresh
   ============================================================ */
(function (HT) {
  const NAV = ['overview', 'power', 'water', 'budget', 'studio', 'settings'];
  let active = 'overview';
  const sectionEl = (n) => HT.$(`.module[data-module="${n}"]`);
  const renderModule = (n) => HT.modules[n].render(sectionEl(n));

  function renderAlerts() {
    // Overview shows every module's alert; a module tab shows only its own; Settings shows none.
    const mods = active === 'overview' ? ['power', 'water', 'budget'] : (active === 'settings' ? [] : [active]);
    const alerts = mods.map(m => HT.modules[m] && HT.modules[m].alert && HT.modules[m].alert()).filter(Boolean);
    const banner = HT.$('#alertBanner');
    if (!alerts.length) { banner.className = 'alert-banner hidden'; banner.innerHTML = ''; return; }
    const worst = alerts.some(a => a.level === 'bad') ? 'bad' : 'warn';
    banner.className = `alert-banner ${worst}`;
    banner.innerHTML = alerts.slice(0, 3).map(a => `<div class="a-line">${a.text}</div>`).join('');
    HT.maybeNotify('alerts', (alerts.find(a => a.level === 'bad') || alerts[0]).text);
  }

  function go(n) {
    active = n;
    document.body.dataset.module = n;
    NAV.forEach(x => sectionEl(x).classList.toggle('hidden', x !== n));
    HT.$$('.tab').forEach(b => b.classList.toggle('active', b.dataset.nav === n));
    HT.$('#brandSub').textContent = HT.modules[n].title;
    renderModule(n);
    renderAlerts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function refresh() { updateNav(); renderModule(active); renderAlerts(); if (HT.notify) HT.notify.sync(); }
  function reconcileAll() { NAV.forEach(n => { const m = HT.modules[n]; if (m.reconcile) m.reconcile(); }); }

  // Studio has no bottom-nav tab — it's reached from a tile on the Home screen.
  // If it's turned off while open, fall back to Home.
  function updateNav() {
    const show = HT.studio && HT.studio.visible && HT.studio.visible();
    if (!show && active === 'studio') go('overview');
  }

  HT.go = go; HT.refresh = refresh; HT.reconcileAll = reconcileAll; HT.updateNav = updateNav;
  // Coming back to the app: redraw (fresh predictions, updated alert checklist) and re-arm alerts.
  HT.onResume(refresh);

  // init modules (delegated listeners on each section)
  NAV.forEach(n => { const m = HT.modules[n]; if (m.init) m.init(sectionEl(n)); });

  // modal + quick add + nav
  HT.$('#modalClose').addEventListener('click', HT.closeModal);
  HT.$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') HT.closeModal(); });
  HT.$('#quickAddBtn').addEventListener('click', () => HT.modules[active].quickAdd());
  HT.$$('.tab').forEach(b => b.addEventListener('click', () => go(b.dataset.nav)));

  // reconcile utility→budget links, then render
  if (HT.state.settings.linkUtilities !== false) { reconcileAll(); HT.save(); }
  go('overview');
  updateNav();

  // Automatic SMS capture (Android app only; no-op in a browser)
  if (HT.sms) HT.sms.init();

  // Register the offline service worker only on real web hosting — not on localhost
  // (dev) and not inside the Capacitor app, where assets are already local and a
  // stale SW would just serve old code.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  }
})(window.HT);
