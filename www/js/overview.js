/* ============================================================
   HomeTrack — Overview (at-a-glance dashboard of all modules)
   ============================================================ */
(function (HT) {
  const { num, money, cur } = HT;

  function collectAlerts() {
    return ['power', 'water', 'budget'].map(m => HT.modules[m] && HT.modules[m].alert && HT.modules[m].alert()).filter(Boolean);
  }

  function render(el) {
    const alerts = collectAlerts();
    const worst = alerts.some(a => a.level === 'bad') ? 'bad' : alerts.some(a => a.level === 'warn') ? 'warn' : 'good';
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const statusTxt = !alerts.length ? 'Everything looks healthy.' : `${alerts.length} thing${alerts.length > 1 ? 's' : ''} need${alerts.length > 1 ? '' : 's'} attention.`;
    let html = `<div class="hero"><div class="hero-label">${greet}</div><div class="hero-sub" style="font-size:22px;font-weight:700;margin:6px 0">${statusTxt}</div><div class="hero-empty">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>${alerts.length ? `<span class="ring ${worst}">${worst === 'bad' ? 'Action needed' : 'Heads up'}</span>` : '<span class="ring good">All good</span>'}</div>`;
    // Transactions captured from SMS waiting for approval — reviewable right here, no trip to Settings.
    const pend = (HT.sms && HT.sms.pending && HT.sms.pending()) || [];
    if (pend.length) html += `<div class="review-bar" data-ov="review" style="cursor:pointer"><span>📩 <b>${pend.length}</b> transaction${pend.length === 1 ? '' : 's'} to review</span><button class="btn btn-sm btn-primary" data-ov="review">Review</button></div>`;
    html += tilePower() + tileWater() + tileBudget();
    if (HT.studio && HT.studio.visible && HT.studio.visible()) html += studioTile();
    el.innerHTML = html;
  }

  function studioTile() {
    return `<div class="ov-tile" data-ov="go" data-mod="studio"><div class="ov-ic" style="background:color-mix(in srgb,#a78bfa 20%, transparent)">✨</div><div class="ov-main"><div class="ov-title">Studio</div><div class="ov-line">Gallery · Chat · PixelAnvil</div></div><div class="ov-chev">›</div></div>`;
  }

  function tilePower() {
    const s = HT.power.situation();
    let big = 'Set up', line = 'Log a meter reading';
    if (s.hasData) { big = (s.daysRemaining === Infinity ? '—' : num(s.daysRemaining, 1)) + ' d'; const mp = HT.power.monthProjection(); line = `≈ ${num(s.estimated, 0)} kWh left · ~${money(mp.projCost, 0)} ${cur()} this month`; }
    return tile('power', '⚡', '#ffb703', 'Power', line, big);
  }
  function tileWater() {
    const s = HT.water.situation();
    let big = 'Set up', line = 'Log a meter reading';
    if (s.hasData) { if (s.projBill != null) { big = money(s.projBill, 0); line = `${num(s.usage, 1)} m³ · bill est.`; } else { big = num(s.usage, 1) + ' m³'; line = 'used this cycle'; } }
    return tile('water', '💧', '#38bdf8', 'Water', line, big);
  }
  function tileBudget() {
    const p = HT.budget.projection(), r = HT.budget.runway();
    const hasData = HT.state.budget.transactions.length > 0 || HT.state.budget.settings.startingBalance > 0;
    let big = 'Set up', line = 'Set your balance';
    if (hasData) { if (p.budget > 0) { big = money(p.budgetedSpent, 0); line = `of ${money(p.budget, 0)} ${cur()} budget`; } else { big = money(r.bal, 0); line = (r.rate > 0 && r.bal > 0) ? `~${num(r.days, 1)} days runway` : 'balance'; } }
    return tile('budget', '💰', '#34d399', 'Budget', line, big);
  }
  function tile(mod, ic, color, title, line, big) {
    return `<div class="ov-tile" data-ov="go" data-mod="${mod}"><div class="ov-ic" style="background:color-mix(in srgb,${color} 20%, transparent)">${ic}</div><div class="ov-main"><div class="ov-title">${title}</div><div class="ov-line">${line}</div></div><div class="ov-right"><div class="ov-big">${big}</div></div><div class="ov-chev">›</div></div>`;
  }

  // Shared "what to add?" chooser, reused by the header + on Overview and Settings.
  function quickAdd() {
    const body = `<div class="btn-col">
      <button class="btn" data-qa="power">⚡ Log power (reading / recharge)</button>
      <button class="btn" data-qa="water">💧 Log water (reading / payment)</button>
      <button class="btn btn-primary" data-qa="budget">💰 Add transaction</button></div>`;
    HT.openModal('What would you like to add?', body, (root) => {
      HT.$$('[data-qa]', root).forEach(b => b.addEventListener('click', () => { const m = b.dataset.qa; HT.closeModal(); HT.modules[m].quickAdd(); }));
    });
  }

  function init(el) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-ov="review"]')) { if (HT.reviewSms) HT.reviewSms(); return; }
      const b = e.target.closest('[data-ov="go"]'); if (b) HT.go(b.dataset.mod);
    });
  }

  HT.register('overview', { title: 'Overview', mark: '🏠', sub: 'Home', render, init, quickAdd, alert: () => null, reconcile: () => {} });
  HT.overviewAlerts = collectAlerts;
})(window.HT);
