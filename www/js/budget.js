/* ============================================================
   HomeTrack — Budget module (balance + runway + envelopes)
   ============================================================ */
(function (HT) {
  const { $, uid, t, num, money, cur, escapeHtml, PALETTE, barColor } = HT;
  const DAY = HT.DAY;
  const B = () => HT.state.budget;
  const catById = (id) => B().categories.find(c => c.id === id);

  /* ---------- engine ---------- */
  function cycleBounds(ref) {
    const now = ref || new Date();
    const sd = Math.min(28, Math.max(1, B().settings.monthStartDay || 1));
    let start = new Date(now.getFullYear(), now.getMonth(), sd);
    if (now < start) start = new Date(now.getFullYear(), now.getMonth() - 1, sd);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, sd);
    return { start, end };
  }
  const inCycle = () => { const { start, end } = cycleBounds(); return B().transactions.filter(x => t(x.t) >= start.getTime() && t(x.t) < end.getTime()); };
  const sumExp = (l) => l.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
  const sumInc = (l) => l.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0);
  // startingBalance is "what I really had at balanceAt", so only later-dated transactions move it.
  // (balanceAt 0 = older data with no anchor: count everything, as before.)
  const sinceBalance = () => { const at = B().settings.balanceAt || 0; return B().transactions.filter(x => t(x.t) >= at); };
  const balance = () => B().settings.startingBalance + sumInc(sinceBalance()) - sumExp(sinceBalance());
  const totalBudget = () => B().categories.filter(c => c.type === 'expense').reduce((s, c) => s + (c.budget || 0), 0);
  const spentThisCycle = () => sumExp(inCycle());
  const incomeThisCycle = () => sumInc(inCycle());
  const budgetedSpentThisCycle = () => { const bs = new Set(B().categories.filter(c => c.type === 'expense' && (c.budget || 0) > 0).map(c => c.id)); return inCycle().filter(x => x.type === 'expense' && bs.has(x.categoryId)).reduce((s, x) => s + x.amount, 0); };
  const SMOOTH_DAYS = 5, PROJECT_MIN_DAYS = 2, RUNWAY_MIN_DAYS = 3;
  function spentByCategory() { const m = {}; inCycle().filter(x => x.type === 'expense').forEach(x => m[x.categoryId] = (m[x.categoryId] || 0) + x.amount); return m; }
  function incomeByCategory() { const m = {}; inCycle().filter(x => x.type === 'income').forEach(x => m[x.categoryId] = (m[x.categoryId] || 0) + x.amount); return m; }
  function avgDailySpend() {
    const win = B().settings.window, now = Date.now();
    let fromT, days;
    if (win > 0) {
      // Divide by the history we actually have (min 5 days), not the full window — otherwise a
      // new user's spend rate is understated and runway looks far longer than it is.
      fromT = now - win * DAY;
      const first = B().transactions.filter(x => x.type === 'expense').reduce((m, x) => Math.min(m, t(x.t)), Infinity);
      const span = isFinite(first) ? (now - first) / DAY : win;
      days = Math.min(win, Math.max(SMOOTH_DAYS, span));
    } else { const { start } = cycleBounds(); fromT = start.getTime(); days = Math.max(SMOOTH_DAYS, (now - fromT) / DAY); }
    const spent = B().transactions.filter(x => x.type === 'expense' && t(x.t) >= fromT && t(x.t) <= now).reduce((s, x) => s + x.amount, 0);
    return { rate: spent / days, days };
  }
  function runway() {
    const bal = balance(), { rate } = avgDailySpend();
    if (rate <= 0) return { days: Infinity, emptyAt: null, rate, bal };
    const days = bal > 0 ? bal / rate : 0;
    return { days, emptyAt: bal > 0 ? new Date(Date.now() + days * DAY) : new Date(), rate, bal };
  }
  function projection() {
    const { start, end } = cycleBounds(), now = Date.now();
    const totalDays = (end.getTime() - start.getTime()) / DAY;
    const elapsed = (now - start.getTime()) / DAY;
    const daysLeft = Math.max(0, (end.getTime() - now) / DAY);
    const spent = spentThisCycle(), budgetedSpent = budgetedSpentThisCycle(), budget = totalBudget();
    const canProject = elapsed >= PROJECT_MIN_DAYS;
    const projected = canProject ? budgetedSpent / Math.min(elapsed, totalDays) * totalDays : null;
    return { start, end, totalDays, elapsed, daysLeft, spent, budgetedSpent, budget, canProject, projected };
  }
  function alertLevel() {
    const s = B().settings, { days, bal } = runway(), p = projection();
    if (B().transactions.length === 0 && s.startingBalance === 0) return 'none';
    if (s.startingBalance > 0 && s.lowBalance > 0 && bal < s.lowBalance) return 'bad';
    if (s.startingBalance > 0 && p.elapsed >= RUNWAY_MIN_DAYS && bal > 0 && s.runwayDays > 0 && days < s.runwayDays) return 'bad';
    if (s.overBudgetWarn && p.budget > 0 && (p.budgetedSpent > p.budget || (p.canProject && p.projected > p.budget))) return 'warn';
    return 'good';
  }
  HT.budget = { balance, runway, projection, spentThisCycle, incomeThisCycle, cycleBounds, alertLevel, addAuto };

  function alert() {
    const lvl = alertLevel(); if (lvl === 'good' || lvl === 'none') return null;
    const s = B().settings, r = runway(), p = projection();
    let msg;
    if (s.startingBalance > 0 && s.lowBalance > 0 && r.bal < s.lowBalance) msg = `💰 Low balance — ${money(r.bal, 0)} ${cur()} left.`;
    else if (s.startingBalance > 0 && p.elapsed >= RUNWAY_MIN_DAYS && r.bal > 0 && s.runwayDays > 0 && r.days < s.runwayDays) msg = `💰 Money lasts ~${num(r.days, 1)} more days at this rate.`;
    else msg = `💰 ${p.canProject ? `On pace to spend ${money(p.projected, 0)} ${cur()}` : `Already spent ${money(p.budgetedSpent, 0)} ${cur()}`} — over your ${money(p.budget, 0)} ${cur()} budget.`;
    return { level: lvl, module: 'budget', text: msg };
  }

  // Used by SMS import (Phase 2) and utility links.
  function addAuto(tx) { B().transactions.push({ id: uid(), auto: true, ...tx }); HT.save(); }

  const cycleLabel = () => { const { start, end } = cycleBounds(); return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(end.getTime() - DAY).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`; };

  /* ---------- render ---------- */
  function render(el) {
    let html = '';
    const hasData = B().transactions.length > 0 || B().settings.startingBalance > 0;
    const p = projection();
    if (!hasData && p.budget === 0) {
      html += `<div class="hero"><div class="hero-label">Get started</div><div class="hero-sub" style="margin-top:8px">Set your balance in Budget settings, tap ＋ to log spending, and give categories a budget below.</div></div>`;
    } else if (p.budget > 0) {
      const spentB = p.budgetedSpent, pct = spentB / p.budget;
      const over = spentB > p.budget || (p.canProject && p.projected > p.budget);
      const near = !over && (pct >= 0.9 || (p.canProject && p.projected > p.budget * 0.9));
      const lvl = over ? 'bad' : near ? 'warn' : 'good';
      const paceLine = p.canProject ? `On pace for ~${money(p.projected, 0)} ${cur()}` : `${Math.max(1, Math.ceil(p.elapsed))} day${Math.ceil(p.elapsed) > 1 ? 's' : ''} in — too early to project`;
      const overall = Math.abs(p.spent - spentB) > 0.001 ? `<div class="hero-empty" style="margin-top:2px">${money(p.spent, 0)} ${cur()} spent overall (incl. unbudgeted)</div>` : '';
      html += `<div class="hero">
        <div class="hero-label">Spent in budgets · ${cycleLabel()}</div>
        <div class="hero-big">${money(spentB, 0)} <small>${cur()}</small></div>
        <div class="hero-progress"><i style="width:${Math.min(100, pct * 100)}%;background:${barColor(pct)}"></i></div>
        <div class="hero-sub">of <strong>${money(p.budget, 0)} ${cur()}</strong> · ${Math.ceil(p.daysLeft)} days left</div>
        <div class="hero-empty">${paceLine}</div>${overall}
        <span class="ring ${lvl}">${over ? 'Over budget' : near ? 'Near limit' : 'On track'}</span></div>`;
    } else {
      const r = runway();
      const sub = r.rate > 0 && r.bal > 0 ? `Lasts ≈ <strong>${num(r.days, 1)} days</strong> · empty ${r.emptyAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Log spending to estimate runway';
      html += `<div class="hero"><div class="hero-label">Balance</div><div class="hero-big">${money(r.bal, 0)} <small>${cur()}</small></div><div class="hero-sub">${sub}</div><div class="hero-empty">Give categories a budget below to track a monthly target.</div></div>`;
    }

    if (hasData) {
      const bal = balance(), r = runway(), inc = incomeThisCycle(), sp = spentThisCycle(), net = inc - sp, { rate } = avgDailySpend();
      const cards = [
        ['Balance', `${money(bal, 0)} <small>${cur()}</small>`, bal < 0 ? 'neg' : 'pos'], ['Runway', `${bal <= 0 ? '—' : (r.days === Infinity ? '∞' : num(r.days, 1))} <small>${bal <= 0 ? '' : 'days'}</small>`, ''],
        ['Income', `${money(inc, 0)} <small>${cur()}</small>`, 'pos'], ['Spent', `${money(sp, 0)} <small>${cur()}</small>`, ''],
        ['Net', `${net >= 0 ? '+' : ''}${money(net, 0)} <small>${cur()}</small>`, net >= 0 ? 'pos' : 'neg'], ['Avg/day', `${money(rate, 0)} <small>${cur()}</small>`, '']
      ];
      html += `<div class="stat-grid">${cards.map(([l, v, c]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value ${c}">${v}</div></div>`).join('')}</div>`;
    }

    // daily spend chart
    html += `<div class="card"><div class="card-head"><h2>Spending this cycle</h2></div><div class="chart">${HT.barChart(dailyBuckets().slice(-21).map(d => ({ label: String(d.d.getDate()), value: d.spent, title: `${HT.fmtDay(d.d)}: ${money(d.spent, 0)} ${cur()}` })), { empty: 'Log expenses to see daily spending.', avgDec: 0 })}</div></div>`;
    // category chart
    const smap = spentByCategory();
    const rows = Object.keys(smap).map(id => ({ cat: catById(id), amt: smap[id] })).filter(r => r.cat && r.amt > 0).sort((a, b) => b.amt - a.amt);
    const totalSpent = rows.reduce((s, r) => s + r.amt, 0);
    html += `<div class="card"><div class="card-head"><h2>Where the money went</h2><span class="hint">${totalSpent > 0 ? money(totalSpent, 0) + ' ' + cur() : ''}</span></div>${rows.length ? HT.hbars(rows.slice(0, 7).map(r => ({ icon: r.cat.icon, name: r.cat.name, right: `${money(r.amt, 0)} · ${Math.round(r.amt / totalSpent * 100)}%`, pct: r.amt / totalSpent * 100, color: r.cat.color }))) : '<div class="empty">Spending by category appears here.</div>'}</div>`;

    // history
    const items = [...B().transactions].sort((a, b) => t(b.t) - t(a.t)).slice(0, 60);
    html += `<div class="card"><div class="card-head"><h2>History</h2><span class="hint">${B().transactions.length} entries</span></div><div class="history-list">${items.length ? items.map(histRow).join('') : '<div class="empty" style="padding:14px 0">No transactions yet.</div>'}</div></div>`;

    // budgets summary + categories
    const budget = totalBudget();
    const bSpent = budgetedSpentThisCycle();
    const pct = budget > 0 ? bSpent / budget : 0;
    html += `<div class="card summary-card"><div class="summary-row"><div><span class="summary-label">Spent in budgets</span><span class="summary-value">${money(bSpent, 0)}</span></div><div><span class="summary-label">Budgeted</span><span class="summary-value">${budget > 0 ? money(budget, 0) : '–'}</span></div></div><div class="progress"><i style="width:${Math.min(100, pct * 100)}%;background:${barColor(pct)}"></i></div><p class="hint" style="margin-top:8px">${budget > 0 ? (pct >= 1 ? "You've used all of this cycle's budget." : `${money(budget - bSpent, 0)} ${cur()} left with ${Math.ceil(projection().daysLeft)} days to go.`) : 'Give expense categories a budget to track a target.'}</p></div>`;

    const imap = incomeByCategory();
    const cats = [...B().categories].sort((a, b) => a.type !== b.type ? (a.type === 'expense' ? -1 : 1) : (b.budget || 0) - (a.budget || 0) || (smap[b.id] || 0) - (smap[a.id] || 0));
    html += `<div class="card"><div class="card-head"><h2>Categories</h2><button class="btn btn-sm" data-b="addCat">＋ Add</button></div><div class="row-list">${cats.map(c => catRow(c, smap, imap)).join('')}</div></div>`;

    // budget settings
    const st = B().settings;
    html += `<div class="card"><div class="card-head"><h2>Budget settings</h2></div><form class="form" data-b="settings">
        <label class="field"><span>Current balance / cash on hand (${cur()})</span><input type="number" step="0.01" name="startingBalance" value="${st.startingBalance || ''}"><em class="sub-note">Your real total right now — only transactions dated after this moment change it.</em></label>
        <div class="row"><label class="field"><span>Cycle resets on day</span><select name="monthStartDay">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${st.monthStartDay == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label><label class="field"><span>Spend rate on last</span><select name="window">${[['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['0', 'This cycle']].map(([v, l]) => `<option value="${v}" ${st.window == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="row"><label class="field"><span>Low balance alert (${cur()})</span><input type="number" step="1" name="lowBalance" value="${st.lowBalance || ''}"></label><label class="field"><span>Low runway alert (days)</span><input type="number" step="1" name="runwayDays" value="${st.runwayDays || ''}"></label></div>
        <label class="check"><input type="checkbox" name="overBudgetWarn" ${st.overBudgetWarn ? 'checked' : ''}><span>Warn when projected to exceed the cycle budget</span></label>
      </form></div>`;

    el.innerHTML = html;
  }

  function dailyBuckets() {
    const { start } = cycleBounds(), now = new Date(), days = [];
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let guard = 0;
    while (d <= today && guard++ < 40) {
      const ds = d.getTime(), de = ds + DAY;
      const spent = B().transactions.filter(x => x.type === 'expense' && t(x.t) >= ds && t(x.t) < de).reduce((s, x) => s + x.amount, 0);
      days.push({ d: new Date(d), spent });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return days;
  }
  function histRow(x) {
    const c = catById(x.categoryId);
    const sign = x.type === 'income' ? '+' : '−';
    const src = x.source === 'power' ? '<span class="auto-badge" style="color:#ffb703;background:color-mix(in srgb,#ffb703 20%,transparent)">⚡ power</span>' : x.source === 'water' ? '<span class="auto-badge">💧 water</span>' : x.auto ? '<span class="auto-badge">auto</span>' : '';
    // power/water links are managed from their module; everything else (incl. SMS) is deletable here
    const del = (x.source === 'power' || x.source === 'water') ? '' : `<button class="hist-del" data-b="delTx" data-id="${x.id}">✕</button>`;
    const edit = (x.source === 'power' || x.source === 'water') ? '' : ` data-b="editTx" data-id="${x.id}" style="cursor:pointer"`;
    return `<div class="hist-item"${edit}><div class="hist-icon" style="background:${c ? 'color-mix(in srgb,' + c.color + ' 20%, transparent)' : 'var(--bg-elev-2)'}">${c ? escapeHtml(c.icon || '•') : '•'}</div>
      <div class="hist-main"><div class="hist-title">${c ? escapeHtml(c.name) : 'Uncategorised'}${x.note ? ' · ' + escapeHtml(x.note) : ''}${src}</div><div class="hist-sub">${HT.fmtDateTime(x.t)} · ${HT.relTime(x.t)}</div></div>
      <div class="hist-amt ${x.type === 'income' ? 'pos' : 'neg'}">${sign}${money(x.amount)}</div>${del}</div>`;
  }
  function catRow(c, smap, imap) {
    if (c.type === 'income') { const got = imap[c.id] || 0; return `<div class="li" data-b="editCat" data-id="${c.id}"><div class="li-ic" style="background:color-mix(in srgb,${c.color} 20%, transparent)">${escapeHtml(c.icon || '➕')}</div><div class="li-main"><div class="li-name">${escapeHtml(c.name)}</div><div class="li-sub">income this cycle</div></div><div class="li-right"><div class="li-amt" style="color:var(--good)">+${money(got, 0)}</div><span class="badge">income</span></div></div>`; }
    const sp = smap[c.id] || 0, b = c.budget || 0, pp = b > 0 ? sp / b : 0;
    const bar = b > 0 ? `<div class="li-track"><div class="li-fill" style="width:${Math.min(100, pp * 100)}%;background:${barColor(pp)}"></div></div>` : '';
    const right = b > 0 ? `<div class="li-amt">${money(sp, 0)} / ${money(b, 0)}</div><div class="li-sub">${pp >= 1 ? 'over by ' + money(sp - b, 0) : money(b - sp, 0) + ' left'}</div>` : `<div class="li-amt">${money(sp, 0)}</div><div class="li-sub">no budget</div>`;
    return `<div class="li" data-b="editCat" data-id="${c.id}"><div class="li-ic" style="background:color-mix(in srgb,${c.color} 20%, transparent)">${escapeHtml(c.icon || '•')}</div><div class="li-main"><div class="li-name">${escapeHtml(c.name)}</div>${bar}</div><div class="li-right">${right}</div></div>`;
  }

  /* ---------- quick add: transaction ---------- */
  function quickAdd(editId) {
    const tx = typeof editId === 'string' ? B().transactions.find(x => x.id === editId) : null;
    const now = tx ? String(tx.t).slice(0, 16) : HT.toLocalInput(new Date());
    const opts = (type) => B().categories.filter(c => c.type === type).map(c => `<option value="${c.id}">${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}</option>`).join('');
    const body = `
      <div class="segmented" id="txToggle"><button type="button" class="seg active" data-type="expense">− Expense</button><button type="button" class="seg" data-type="income">＋ Income</button></div>
      <form class="form" id="txForm">
        <label class="field"><span>Amount (${cur()})</span><input type="number" step="0.01" inputmode="decimal" name="amount" placeholder="0" required></label>
        <label class="field"><span>Category</span><select name="categoryId" required>${opts('expense')}</select></label>
        <label class="field"><span>Note <em>opt</em></span><input type="text" name="note" placeholder="e.g. Shoprite"></label>
        <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="time" value="${now}" required></label>
        <button class="btn btn-primary" type="submit" id="txSubmit">Save expense</button>
        ${tx ? '<button type="button" class="btn btn-danger" id="txDel">Delete</button>' : ''}
      </form>`;
    HT.openModal(tx ? 'Edit transaction' : 'Add transaction', body, (root) => {
      let type = 'expense';
      const f = $('#txForm', root);
      const setType = (ty) => {
        type = ty;
        HT.$$('#txToggle .seg', root).forEach(x => x.classList.toggle('active', x.dataset.type === ty));
        f.categoryId.innerHTML = opts(ty);
        $('#txSubmit', root).textContent = ty === 'income' ? 'Save income' : 'Save expense';
      };
      HT.$$('#txToggle .seg', root).forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));
      if (tx) {
        setType(tx.type);
        f.amount.value = tx.amount; f.note.value = tx.note || '';
        if (tx.categoryId && catById(tx.categoryId)) f.categoryId.value = tx.categoryId;
        $('#txDel', root).addEventListener('click', () => { if (confirm('Delete this transaction?')) { B().transactions = B().transactions.filter(x => x.id !== tx.id); HT.save(); HT.closeModal(); HT.refresh(); } });
      }
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseFloat(f.amount.value);
        if (isNaN(amount) || amount <= 0 || !f.categoryId.value || !f.time.value) return;
        const data = { t: f.time.value, amount, categoryId: f.categoryId.value, type, note: f.note.value.trim() };
        if (tx) Object.assign(tx, data); else B().transactions.push({ id: uid(), ...data });
        HT.save(); HT.closeModal(); HT.refresh(); HT.toast(type === 'income' ? 'Income saved' : 'Expense saved');
      });
    });
  }

  /* ---------- category modal ---------- */
  function catModal(id) {
    const c = id ? catById(id) : null;
    let color = c ? c.color : PALETTE[0], type = c ? c.type : 'expense';
    const body = `<form class="form" id="catForm">
      <div class="segmented" id="ctToggle"><button type="button" class="seg ${type === 'expense' ? 'active' : ''}" data-ct="expense">Expense</button><button type="button" class="seg ${type === 'income' ? 'active' : ''}" data-ct="income">Income</button></div>
      <div class="row"><label class="field" style="flex:0 0 84px"><span>Icon</span><input name="icon" maxlength="8" value="${c ? escapeHtml(c.icon || '') : ''}" placeholder="🛒"></label><label class="field"><span>Name</span><input name="name" value="${c ? escapeHtml(c.name) : ''}" required></label></div>
      <label class="field" id="budgetField" style="${type === 'income' ? 'display:none' : ''}"><span>Monthly budget (${cur()})</span><input type="number" step="1" name="budget" value="${c && c.budget ? c.budget : ''}" placeholder="0"></label>
      <div class="field"><span>Colour</span><div class="swatches" id="ctSwatches"></div></div>
      <div class="btn-col"><button class="btn btn-primary" type="submit">Save</button>${c ? '<button type="button" class="btn btn-danger" id="ctDel">Delete</button>' : ''}</div></form>`;
    HT.openModal(c ? 'Edit category' : 'Add category', body, (root) => {
      const drawSw = () => $('#ctSwatches', root).innerHTML = PALETTE.map(x => `<div class="swatch ${x === color ? 'sel' : ''}" data-color="${x}" style="background:${x}"></div>`).join('');
      drawSw();
      $('#ctSwatches', root).addEventListener('click', (e) => { const s = e.target.closest('[data-color]'); if (s) { color = s.dataset.color; drawSw(); } });
      HT.$$('#ctToggle .seg', root).forEach(b => b.addEventListener('click', () => { type = b.dataset.ct; HT.$$('#ctToggle .seg', root).forEach(x => x.classList.toggle('active', x === b)); $('#budgetField', root).style.display = type === 'income' ? 'none' : ''; }));
      const f = $('#catForm', root);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = { name: f.name.value.trim(), type, icon: f.icon.value.trim(), color, budget: type === 'expense' ? (parseFloat(f.budget.value) || 0) : 0 };
        if (!data.name) return;
        if (c) Object.assign(c, data); else B().categories.push({ id: uid(), ...data });
        HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Category saved');
      });
      if (c) $('#ctDel', root).addEventListener('click', () => {
        const used = B().transactions.some(x => x.categoryId === c.id);
        if (confirm(used ? 'This category has transactions. Delete anyway? (Transactions become uncategorised.)' : 'Delete this category?')) { B().categories = B().categories.filter(x => x.id !== c.id); HT.save(); HT.closeModal(); HT.refresh(); }
      });
    });
  }

  function init(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]'); if (!b || b.tagName === 'FORM') return;
      const act = b.dataset.b, id = b.dataset.id;
      if (act === 'delTx') { if (confirm('Delete this transaction?')) { B().transactions = B().transactions.filter(x => x.id !== id); HT.save(); HT.refresh(); } }
      else if (act === 'editTx') quickAdd(id);
      else if (act === 'addCat') catModal(null);
      else if (act === 'editCat') catModal(id);
    });
    el.addEventListener('change', (e) => {
      const form = e.target.closest('form[data-b="settings"]'); if (!form) return;
      const st = B().settings;
      const newBal = parseFloat(form.startingBalance.value) || 0;
      if (newBal !== st.startingBalance) { st.startingBalance = newBal; st.balanceAt = Math.floor(Date.now() / 60000) * 60000; }   // minute precision, like transaction times
      st.monthStartDay = parseInt(form.monthStartDay.value, 10) || 1;
      st.window = parseInt(form.window.value, 10);
      st.lowBalance = parseFloat(form.lowBalance.value) || 0;
      st.runwayDays = parseFloat(form.runwayDays.value) || 0;
      st.overBudgetWarn = form.overBudgetWarn.checked;
      HT.save(); HT.refresh();
    });
  }

  HT.register('budget', { title: 'Budget', mark: '💰', sub: 'Money & budgets', quickAddLabel: 'Add transaction', render, init, quickAdd, alert, reconcile: () => {} });
})(window.HT);
