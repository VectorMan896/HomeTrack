/* ============================================================
   HomeTrack — Settings (global prefs, SMS, account/sync,
   per-module data, backup)
   ============================================================ */
(function (HT) {
  const MODS = [['power', '⚡', 'Power'], ['water', '💧', 'Water'], ['budget', '💰', 'Budget']];

  function render(el) {
    const g = HT.state.settings;
    let html = '';

    html += accountCard();

    // Admin · Studio (only for the admin account)
    if (HT.studio && HT.studio.isAdmin()) {
      const st = HT.studio.ST();
      html += `<div class="card"><div class="card-head"><h2>Admin · Studio</h2><span class="badge">admin</span></div>
        <form class="form" data-set="studio">
          <label class="check"><input type="checkbox" name="showHidden" ${st.showHidden ? 'checked' : ''}><span>Show hidden features (adds the <b>Studio</b> tab)</span></label>
          <label class="field"><span>PC address (LAN or Tailscale IP)</span><input name="host" value="${HT.escapeHtml(st.host || '')}" placeholder="e.g. 192.168.1.10 or 100.x.x.x"></label>
        </form>
        <div class="btn-col" style="margin-top:10px"><button class="btn" data-set="testBridge">Test bridge connection</button></div>
        <p class="hint" style="margin-top:8px">Run the bridge server on your PC (the app's <code>bridge/</code> folder) for Gallery, Chat and PixelAnvil. PixelAnvil also needs ComfyUI running on the PC.</p></div>`;
    }

    // App settings
    html += `<div class="card"><div class="card-head"><h2>App settings</h2></div><form class="form" data-set="settings">
        <label class="field"><span>Language</span><select name="lang">
          <option value="en" ${g.lang !== 'pt' ? 'selected' : ''}>English</option>
          <option value="pt" ${g.lang === 'pt' ? 'selected' : ''}>Português</option>
        </select></label>
        <label class="field"><span>Theme</span><select name="theme">
          <option value="system" ${g.theme !== 'light' && g.theme !== 'dark' ? 'selected' : ''}>System (match device)</option>
          <option value="light" ${g.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${g.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select></label>
        <label class="field"><span>Currency label</span><input type="text" name="currency" value="${g.currency}"></label>
        <label class="check"><input type="checkbox" name="linkUtilities" ${g.linkUtilities !== false ? 'checked' : ''}><span>Add power recharges &amp; water bills to the budget automatically</span></label>
        <label class="check"><input type="checkbox" name="notify" ${g.notify ? 'checked' : ''}><span>Enable notifications for alerts</span></label>
      </form></div>`;

    // Daily reminders
    const rem = g.reminders || {}; const rp = rem.power || {}, rbg = rem.budget || {};
    html += `<div class="card"><div class="card-head"><h2>Daily reminders</h2></div><form class="form" data-set="reminders">
        <label class="check"><input type="checkbox" name="powerOn" ${rp.on ? 'checked' : ''}><span>Remind me to log the power meter</span></label>
        <label class="field"><span>Power reminder time</span><input type="time" name="powerTime" value="${rp.time || '20:00'}"></label>
        <label class="check"><input type="checkbox" name="budgetOn" ${rbg.on ? 'checked' : ''}><span>Remind me to log spending</span></label>
        <label class="field"><span>Budget reminder time</span><input type="time" name="budgetTime" value="${rbg.time || '21:00'}"></label>
      </form><p class="hint" style="margin-top:8px">Repeats daily at the set time, even when the app is closed. Needs notifications allowed.</p></div>`;

    // Reliable alerts (Android): settings that decide whether warnings fire when the app is closed
    if (HT.notify && HT.notify.available()) {
      html += `<div class="card"><div class="card-head"><h2>Reliable alerts</h2></div><div id="alertHealth" class="row-list"><p class="hint">Checking…</p></div>
        <div class="btn-col" style="margin-top:10px"><button class="btn" data-set="ahTest">🔔 Send a test notification</button><button class="btn" data-set="ahFix" data-w="app">Open app settings (Autostart)</button></div>
        <p class="hint" style="margin-top:8px">Warnings are scheduled on the phone and fire even when HomeTrack is closed. After a restart, some phones (Xiaomi, Samsung, Oppo, Huawei…) only restore them if <b>Autostart</b> is allowed and battery optimisation is off for HomeTrack. Opening the app also re-arms everything.</p></div>`;
    }

    // SMS auto-capture
    const sms = g.sms || {};
    if (HT.sms && HT.sms.available()) {
      const last = sms.lastScan ? new Date(sms.lastScan).toLocaleString() : 'never';
      const senders = sms.senders || [];
      const chips = senders.length
        ? senders.map(x => `<span class="chip">${HT.escapeHtml(x)}<button data-set="delSender" data-v="${HT.escapeHtml(x)}" aria-label="remove">✕</button></span>`).join('')
        : '<span class="hint">None approved yet — nothing is imported until you add a sender.</span>';
      const pend = (HT.sms.pending && HT.sms.pending()) || [];
      const reviewBar = pend.length
        ? `<div class="review-bar"><span><b>${pend.length}</b> transaction${pend.length === 1 ? '' : 's'} awaiting review</span><button class="btn btn-sm btn-primary" data-set="reviewSms">Review</button></div>`
        : `<p class="hint" style="margin:12px 0 0">Nothing waiting for review. Scan or receive a text from an approved sender and it'll queue here.</p>`;
      html += `<div class="card"><div class="card-head"><h2>SMS capture <span class="badge" style="background:color-mix(in srgb,var(--accent-2) 18%,transparent);color:var(--accent-2)">review</span></h2></div>
        <form class="form" data-set="sms"><label class="check"><input type="checkbox" name="smsEnabled" ${sms.enabled !== false ? 'checked' : ''}><span>Read texts from approved senders (you approve each before it's added)</span></label></form>
        ${reviewBar}
        <p class="hint" style="margin:14px 0 6px">Approved senders — only messages from these are ever read:</p>
        <div class="chips">${chips}</div>
        <div class="row" style="gap:8px;margin-top:10px"><label class="field" style="flex:1"><input id="newSender" placeholder="Add a sender, e.g. M-Pesa"></label><button class="btn btn-sm" data-set="addSender" style="align-self:flex-end;height:46px">Add</button></div>
        <div class="btn-col" style="margin-top:10px">
          <button class="btn" data-set="detectSenders">🔎 Detect senders from my inbox</button>
          <button class="btn" data-set="smsScan">🔍 Scan for new transactions</button>
          <button class="btn btn-danger" data-set="clearSms">🗑 Remove SMS-imported entries</button>
          <button class="btn btn-danger" data-set="forgetSms">↺ Forget SMS history (re-review all)</button>
        </div>
        <p class="hint" style="margin-top:8px">Last scan: ${last}. Nothing enters your budget until you approve it.</p></div>`;
    } else {
      html += `<div class="card"><div class="card-head"><h2>SMS capture</h2></div><p class="hint">Install the HomeTrack Android app to capture transaction texts (with review). Not available in a browser.</p></div>`;
    }

    // Per-module data
    html += `<div class="card"><div class="card-head"><h2>Per-module data</h2></div>${MODS.map(([m, ic, name]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:18px">${ic}</span><b>${name}</b></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" data-set="modExport" data-m="${m}">Export</button>
            <label class="btn btn-sm" for="imp-${m}" style="margin:0">Import</label><input id="imp-${m}" type="file" accept="application/json" hidden data-set="modImport" data-m="${m}">
            <button class="btn btn-sm btn-danger" data-set="modReset" data-m="${m}">Reset</button>
          </div>
        </div>`).join('')}<p class="hint" style="margin-top:8px">Export, import, or clear just one module — the others stay untouched.</p></div>`;

    // Full backup
    html += `<div class="card"><div class="card-head"><h2>Full backup</h2></div><div class="btn-col">
        <button class="btn" data-set="export">⬇ Export everything (JSON)</button>
        <label class="btn" for="htImport">⬆ Import everything (JSON)</label><input type="file" id="htImport" accept="application/json" hidden>
        <button class="btn btn-danger" data-set="reset">Reset ALL data</button>
      </div><p class="hint" style="margin-top:8px">Data is stored on this device${HT.sync && HT.sync.enabled() ? ' and synced to your account' : ''}. Export regularly to keep a backup.</p></div>`;

    html += `<div class="card about"><p><strong>HomeTrack</strong> · power · water · budget · offline-first.</p></div>`;

    el.innerHTML = html;
    fillHealth(el);
  }

  async function fillHealth(el) {
    const box = el.querySelector('#alertHealth'); if (!box || !HT.notify.health) return;
    const h = await HT.notify.health();
    const row = (ok, name, sub, fixKey) => `<div class="li" style="cursor:default"><div class="li-main"><div class="li-name">${ok ? '✅' : '⚠️'} ${name}</div><div class="li-sub">${sub}</div></div><div class="li-right">${ok ? '<span class="badge">Allowed</span>' : `<button class="btn btn-sm btn-primary" data-set="ahFix" data-w="${fixKey}">Fix</button>`}</div></div>`;
    box.innerHTML = [
      h.alertsOn ? row(true, 'Alerts switched on', 'Power-low and leak warnings', '') : `<div class="li" style="cursor:default"><div class="li-main"><div class="li-name">⚠️ Alerts are off</div><div class="li-sub">Turn on “Enable notifications for alerts” in App settings above.</div></div></div>`,
      row(h.notifOk, 'Notifications', h.notifOk ? 'HomeTrack may show notifications' : 'Blocked — nothing can be shown', 'notif'),
      h.native ? row(h.batteryOk, 'Battery optimisation', h.batteryOk ? 'Not restricted' : 'Restricted — alerts can be delayed or dropped', 'battery') : '',
      h.native ? row(h.exactOk, 'Exact alarms', h.exactOk ? 'Alerts fire on time' : 'Off — alerts may arrive late', 'exact') : ''
    ].join('');
  }

  function accountCard() {
    if (!(HT.sync && HT.sync.available())) {
      return `<div class="card"><div class="card-head"><h2>Account &amp; sync</h2></div><p class="hint">Cloud sync isn't configured yet. Once set up, sign in here to back up your data and use it across devices.</p></div>`;
    }
    const user = HT.sync.currentUser();
    if (user) {
      return `<div class="card"><div class="card-head"><h2>Account &amp; sync</h2><span class="badge">synced</span></div>
        <p class="hint" style="margin-bottom:10px">Signed in as <strong style="color:var(--text)">${HT.escapeHtml(user.email || user.name || 'you')}</strong>. Your data syncs automatically.</p>
        <div class="btn-col"><button class="btn" data-set="syncNow">⟳ Sync now</button><button class="btn btn-danger" data-set="signOut">Sign out</button></div></div>`;
    }
    return `<div class="card"><div class="card-head"><h2>Account &amp; sync</h2></div>
      <p class="hint" style="margin-bottom:10px">Sign in to back up your data to the cloud and use it on any device.</p>
      <div class="btn-col"><button class="btn btn-primary" data-set="signIn">Sign in</button></div></div>`;
  }

  function init(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set]'); if (!b || b.tagName === 'FORM' || b.tagName === 'INPUT') return;
      const act = b.dataset.set;
      if (act === 'smsScan') HT.sms.scanNow();
      else if (act === 'detectSenders') detectSendersModal();
      else if (act === 'addSender') addSender();
      else if (act === 'delSender') { HT.state.settings.sms.senders = (HT.state.settings.sms.senders || []).filter(x => x !== b.dataset.v); HT.save(); HT.refresh(); }
      else if (act === 'clearSms') clearSms();
      else if (act === 'testBridge') testBridge();
      else if (act === 'ahTest') HT.notify.test();
      else if (act === 'ahFix') HT.notify.fix(b.dataset.w).then(() => setTimeout(() => HT.refresh(), 800));
      else if (act === 'reviewSms') reviewModal();
      else if (act === 'forgetSms') { if (confirm('Forget which texts were already seen, so the next scan re-queues everything for review?')) HT.sms.forgetHistory(); }
      else if (act === 'modExport') exportModule(b.dataset.m);
      else if (act === 'modReset') { if (confirm(`Clear all ${b.dataset.m} data? Categories/appliances and settings are kept.`)) resetModule(b.dataset.m); }
      else if (act === 'export') exportAll();
      else if (act === 'reset') { if (confirm('Delete ALL HomeTrack data on this device? This cannot be undone.')) { HT.replaceState(HT.defaultState()); HT.reconcileAll(); HT.save(); HT.refresh(); HT.toast('All data reset'); } }
      else if (act === 'signIn' && HT.sync) HT.sync.signIn();
      else if (act === 'signOut' && HT.sync) HT.sync.signOut();
      else if (act === 'syncNow' && HT.sync) HT.sync.push(true);
    });
    el.addEventListener('change', (e) => {
      if (e.target.id === 'htImport') { importAll(e.target); return; }
      if (e.target.dataset && e.target.dataset.set === 'modImport') { importModule(e.target.dataset.m, e.target); return; }
      const studioForm = e.target.closest('form[data-set="studio"]');
      if (studioForm) { const st = HT.studio.ST(); st.showHidden = studioForm.showHidden.checked; st.host = studioForm.host.value.trim(); HT.save(); if (HT.updateNav) HT.updateNav(); HT.refresh(); return; }
      const remForm = e.target.closest('form[data-set="reminders"]');
      if (remForm) {
        HT.state.settings.reminders = { power: { on: remForm.powerOn.checked, time: remForm.powerTime.value || '20:00' }, budget: { on: remForm.budgetOn.checked, time: remForm.budgetTime.value || '21:00' } };
        HT.save();
        if (HT.notify && HT.notify.available()) { if (remForm.powerOn.checked || remForm.budgetOn.checked) HT.notify.requestPerm().then(() => HT.notify._sync()); else HT.notify._sync(); }
        else HT.toast('Reminders work in the Android app');
        return;
      }
      const smsForm = e.target.closest('form[data-set="sms"]');
      if (smsForm) { HT.state.settings.sms.enabled = smsForm.smsEnabled.checked; HT.save(); if (smsForm.smsEnabled.checked) HT.sms.scanNow(); return; }
      const form = e.target.closest('form[data-set="settings"]'); if (!form) return;
      if (form.lang && form.lang.value !== (HT.state.settings.lang || 'en')) { HT.state.settings.lang = form.lang.value; HT.save(); location.reload(); return; }
      HT.state.settings.theme = form.theme.value; HT.applyTheme();
      HT.state.settings.currency = form.currency.value.trim() || 'MT';
      HT.state.settings.linkUtilities = form.linkUtilities.checked;
      const wantNotify = form.notify.checked;
      HT.state.settings.notify = wantNotify;
      if (HT.notify && HT.notify.available()) { if (wantNotify) HT.notify.requestPerm().then(() => HT.notify._sync()); else HT.notify._sync(); }
      else if (wantNotify && 'Notification' in window && Notification.permission !== 'granted') { Notification.requestPermission().then(p => { HT.state.settings.notify = (p === 'granted'); HT.save(); HT.refresh(); }); }
      if (HT.state.settings.linkUtilities) HT.reconcileAll();
      else HT.state.budget.transactions = HT.state.budget.transactions.filter(x => x.source !== 'power' && x.source !== 'water');
      HT.save(); HT.refresh();
    });
  }

  /* ---- SMS senders ---- */
  function addSender() {
    const inp = document.getElementById('newSender'); if (!inp) return;
    const v = inp.value.trim(); if (!v) return;
    const set = HT.state.settings.sms.senders || (HT.state.settings.sms.senders = []);
    if (!set.includes(v)) set.push(v);
    HT.save(); HT.refresh(); if (HT.sms.available()) HT.sms.scanNow();
  }
  async function detectSendersModal() {
    HT.toast('Reading inbox…');
    const list = await HT.sms.listSenders();
    const approved = new Set(HT.state.settings.sms.senders || []);
    const body = list.length
      ? `<p class="hint" style="margin-bottom:10px">Tick the senders to auto-import from (e.g. M-Pesa, your bank).</p>
         <div class="row-list">${list.map(s => `<label class="li" style="cursor:pointer;gap:10px"><input type="checkbox" class="senderChk" value="${HT.escapeHtml(s.address)}" ${approved.has(s.address) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"><div class="li-main"><div class="li-name">${HT.escapeHtml(s.address)}</div><div class="li-sub">${s.count} msg · ${HT.escapeHtml(s.sample)}…</div></div></label>`).join('')}</div>
         <button class="btn btn-primary" data-save-senders style="margin-top:12px">Save approved senders</button>`
      : `<p class="hint">No SMS found, or permission was denied. Add a sender manually instead.</p>`;
    HT.openModal('Detect senders', body, (root) => {
      const btn = root.querySelector('[data-save-senders]');
      if (btn) btn.addEventListener('click', () => {
        const chosen = HT.$$('.senderChk', root).filter(c => c.checked).map(c => c.value);
        HT.state.settings.sms.senders = chosen; HT.save(); HT.closeModal(); HT.refresh();
        if (chosen.length && HT.sms.available()) HT.sms.scanNow();
        HT.toast(`${chosen.length} sender${chosen.length === 1 ? '' : 's'} approved`);
      });
    });
  }
  async function testBridge() {
    const b = HT.studio && HT.studio.bridge(); if (!b) { HT.toast('Enter your PC address first'); return; }
    HT.toast('Testing…');
    try { const r = await fetch(b + '/health'); const d = await r.json(); HT.toast(d && d.ok ? 'Bridge OK ✓' : 'Unexpected response'); }
    catch (e) { HT.toast('Could not reach bridge — is it running?'); }
  }
  function reviewBody() {
    const items = HT.sms.pending();
    const cats = HT.state.budget.categories;
    const rows = items.length ? items.map(it => {
      const sign = it.type === 'income' ? '+' : '−';
      const defId = it.categoryId || HT.sms.defaultCategoryId(it);
      const catSel = `<select class="rev-cat" data-sig="${it.sig}" style="margin-top:6px;max-width:100%">${cats.filter(c => c.type === it.type).map(c => `<option value="${c.id}" ${c.id === defId ? 'selected' : ''}>${HT.escapeHtml((c.icon || '') + ' ' + c.name)}</option>`).join('')}</select>`;
      return `<div class="li" style="cursor:default;align-items:flex-start;gap:10px">
        <div class="li-main"><div class="li-name" style="color:${it.type === 'income' ? 'var(--good)' : 'var(--text)'}">${sign}${HT.money(it.amount)} ${HT.cur()}</div>
          <div class="li-sub">${HT.escapeHtml(it.address || '')} · ${HT.fmtDateTime(it.t)}</div>
          <div class="li-sub" style="margin-top:3px;color:var(--text-faint)">${HT.escapeHtml(it.body || '')}</div>${catSel}</div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-primary" data-rev="approve" data-sig="${it.sig}">✓ Add</button>
          <button class="btn btn-sm" data-rev="dismiss" data-sig="${it.sig}">Dismiss</button></div></div>`;
    }).join('') : '<p class="hint">Nothing to review right now.</p>';
    const head = items.length ? `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn btn-sm btn-primary" data-rev="approveAll" style="flex:1">Approve all (${items.length})</button><button class="btn btn-sm btn-danger" data-rev="dismissAll" style="flex:1">Dismiss all</button></div>` : '';
    return head + `<div class="row-list">${rows}</div>`;
  }
  function reviewModal() {
    // Listener attached ONCE; approve/dismiss just repaints the inner list (no listener stacking).
    HT.openModal('Review SMS transactions', '<div id="revBody"></div>', (root) => {
      const rev = root.querySelector('#revBody');
      const paint = () => { rev.innerHTML = reviewBody(); };
      paint();
      // Remember a category picked in the list, so "Approve all" and repaints keep it.
      rev.addEventListener('change', (e) => {
        const s = e.target.closest('.rev-cat'); if (!s) return;
        const it = HT.sms.pending().find(x => x.sig === s.dataset.sig); if (it) { it.categoryId = s.value; HT.save(); }
      });
      rev.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rev]'); if (!b) return;
        const a = b.dataset.rev;
        if (a === 'approveAll') { HT.sms.approveAll(); HT.closeModal(); return; }
        if (a === 'dismissAll') { if (confirm('Dismiss all pending SMS? They won\'t be added.')) { HT.sms.dismissAll(); HT.closeModal(); } return; }
        if (a === 'approve') { const s = rev.querySelector(`.rev-cat[data-sig="${b.dataset.sig}"]`); HT.sms.approve(b.dataset.sig, s && s.value); }
        else if (a === 'dismiss') HT.sms.dismiss(b.dataset.sig);
        paint();
      });
    });
  }
  function clearSms() {
    const before = HT.state.budget.transactions.length;
    if (!confirm('Remove all transactions that were auto-imported from SMS? Manual entries are kept.')) return;
    HT.state.budget.transactions = HT.state.budget.transactions.filter(x => x.source !== 'sms');
    HT.save(); HT.refresh(); HT.toast(`Removed ${before - HT.state.budget.transactions.length} SMS entries`);
  }

  /* ---- per-module data ---- */
  function exportModule(m) {
    HT.saveFile(`hometrack-${m}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'HomeTrack', module: m, exportedAt: new Date().toISOString(), data: HT.state[m] }, null, 2));
  }
  function importModule(m, input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && obj.module && obj.module !== m && !confirm(`This file is a "${obj.module}" export. Import into ${m} anyway?`)) { input.value = ''; return; }
        const incoming = obj && obj.data ? obj.data : obj;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw 0;
        if (!confirm(`Replace all ${m} data with this file?`)) { input.value = ''; return; }
        const d = HT.defaultState()[m];
        const merged = Object.assign({}, d, incoming);
        merged.settings = Object.assign({}, d.settings, (incoming && incoming.settings) || {});
        HT.state[m] = merged;
        HT.reconcileAll(); HT.save(); HT.refresh(); HT.toast(m + ' imported');
      } catch (e) { HT.toast('Import failed — invalid file'); }
      input.value = '';
    };
    reader.readAsText(file);
  }
  function resetModule(m) {
    if (m === 'power') { HT.state.power.readings = []; HT.state.power.recharges = []; }
    else if (m === 'water') { HT.state.water.readings = []; HT.state.water.payments = []; }
    else if (m === 'budget') { HT.state.budget.transactions = []; }
    HT.reconcileAll(); HT.save(); HT.refresh(); HT.toast(m + ' data cleared');
  }

  /* ---- full backup ---- */
  function exportAll() { HT.saveFile(`hometrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(HT.state, null, 2)); }
  function importAll(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0;
        if (data.module && data.data) { HT.toast(`That's a ${data.module}-only export — use Per-module data → Import`); input.value = ''; return; }
        if (!data.power && !data.water && !data.budget) throw 0;
        if (!confirm('Replace ALL data on this device with this backup?')) { input.value = ''; return; }
        HT.replaceState(data); HT.reconcileAll(); HT.save(); HT.refresh(); HT.toast('Data imported');
      }
      catch (e) { HT.toast('Import failed — not a HomeTrack backup'); }
      input.value = '';
    };
    reader.readAsText(file);
  }
  HT.reviewSms = reviewModal;   // let the Home screen open the review queue directly
  HT.register('settings', { title: 'Settings', mark: '⚙', sub: 'Settings', render, init, quickAdd: () => HT.modules.overview.quickAdd(), alert: () => null, reconcile: () => {} });
})(window.HT);
