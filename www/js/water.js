/* ============================================================
   HomeTrack — Water module (postpaid meter, counts UP, m³)
   Projects the monthly bill from a tariff and flags leaks.
   ============================================================ */
(function (HT) {
  const { $, uid, t, num, money, cur, escapeHtml } = HT;
  const DAY = HT.DAY;
  const W = () => HT.state.water;

  /* ---------- engine ---------- */
  const readings = () => [...W().readings].sort((a, b) => t(a.t) - t(b.t));
  const payments = () => [...W().payments].sort((a, b) => t(a.t) - t(b.t));

  function intervals() {
    const rs = readings(), out = [];
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1], b = rs[i];
      const consumed = b.m3 - a.m3;
      const days = (t(b.t) - t(a.t)) / DAY;
      out.push({ start: a.t, end: b.t, consumed, days, rate: days > 0 ? consumed / days : null });
    }
    return out;
  }
  function avgDailyM3() {
    const win = W().settings.window;
    const cutoff = win > 0 ? Date.now() - win * DAY : -Infinity;
    const all = intervals().filter(iv => iv.rate != null && iv.consumed >= 0);
    const valid = all.filter(iv => t(iv.end) >= cutoff);
    const pick = valid.length ? valid : all;
    if (!pick.length) return { rate: 0, samples: 0 };
    return { rate: pick.reduce((s, iv) => s + iv.consumed, 0) / pick.reduce((s, iv) => s + iv.days, 0), samples: pick.length };
  }
  // Estimate the meter value (m³) at any time, interpolating/extrapolating.
  function meterAt(time) {
    const rs = readings(); if (!rs.length) return null;
    const rate = avgDailyM3().rate;
    if (time <= t(rs[0].t)) return Math.max(0, rs[0].m3 - rate * (t(rs[0].t) - time) / DAY);
    const last = rs[rs.length - 1];
    if (time >= t(last.t)) return last.m3 + rate * (time - t(last.t)) / DAY;
    for (let i = 1; i < rs.length; i++) {
      if (time <= t(rs[i].t)) {
        const a = rs[i - 1], b = rs[i], f = (time - t(a.t)) / (t(b.t) - t(a.t) || 1);
        return a.m3 + (b.m3 - a.m3) * f;
      }
    }
    return last.m3;
  }
  function cycleBounds(ref) {
    const now = ref || new Date();
    const sd = Math.min(28, Math.max(1, W().settings.cycleDay || 1));
    let start = new Date(now.getFullYear(), now.getMonth(), sd);
    if (now < start) start = new Date(now.getFullYear(), now.getMonth() - 1, sd);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, sd);
    return { start, end };
  }
  function situation() {
    const rs = readings(); if (!rs.length) return { hasData: false };
    const { rate } = avgDailyM3();
    const { start, end } = cycleBounds();
    const now = Date.now();
    const totalDays = (end.getTime() - start.getTime()) / DAY;
    const elapsed = Math.max(0.5, (now - start.getTime()) / DAY);
    const daysLeft = Math.max(0, (end.getTime() - now) / DAY);
    const mNow = meterAt(now), mStart = meterAt(start.getTime());
    const usage = Math.max(0, mNow - mStart);
    const projUsage = usage / Math.min(elapsed, totalDays) * totalDays;
    const st = W().settings;
    const billSoFar = st.ratePerM3 > 0 ? usage * st.ratePerM3 + st.fixed : null;
    const projBill = st.ratePerM3 > 0 ? projUsage * st.ratePerM3 + st.fixed : null;
    return { hasData: true, rate, start, end, totalDays, elapsed, daysLeft, usage, projUsage, billSoFar, projBill, meterNow: mNow };
  }
  function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function leakCheck() {
    const ivs = intervals().filter(x => x.rate != null && x.consumed >= 0);
    const st = W().settings;
    if (ivs.length) {
      const last = ivs[ivs.length - 1];
      if (st.leakPerDay > 0 && last.rate >= st.leakPerDay) return { leak: true, reason: `Last period used ${num(last.rate, 2)} m³/day, at/above your ${num(st.leakPerDay, 2)} m³/day leak threshold.` };
      if (ivs.length >= 3) { const base = median(ivs.slice(0, -1).map(i => i.rate)); if (base > 0 && last.rate > base * 1.8) return { leak: true, reason: `Usage jumped to ${num(last.rate, 2)} m³/day vs a ${num(base, 2)} m³/day baseline — check for a leak.` }; }
    }
    return { leak: false };
  }

  HT.water = { situation, intervals, leakCheck };

  function alert() {
    const lk = leakCheck();
    if (lk.leak) return { level: 'bad', module: 'water', text: `💧 Possible water leak — ${lk.reason}` };
    const s = situation();
    const st = W().settings;
    if (s.hasData && st.alertBill > 0 && s.projBill != null && s.projBill > st.alertBill)
      return { level: 'warn', module: 'water', text: `💧 On pace for a ${money(s.projBill, 0)} ${cur()} water bill — above your ${money(st.alertBill, 0)} ${cur()} limit.` };
    return null;
  }

  /* ---------- render ---------- */
  function render(el) {
    const s = situation();
    let html = '';
    if (!s.hasData) {
      html += `<div class="hero"><div class="hero-label">Get started</div><div class="hero-sub" style="margin-top:8px">Tap ＋ to log the m³ reading on your water meter, then set your tariff in Water settings.</div></div>`;
    } else {
      const lk = leakCheck();
      const hasRate = W().settings.ratePerM3 > 0;
      if (hasRate) {
        const st = W().settings;
        const lvl = lk.leak ? 'bad' : (st.alertBill > 0 && s.projBill > st.alertBill) ? 'warn' : 'good';
        const ringTxt = lk.leak ? 'Possible leak' : lvl === 'warn' ? 'Above limit' : 'On track';
        html += `<div class="hero">
          <div class="hero-label">Projected bill this cycle</div>
          <div class="hero-big">${money(s.projBill, 0)} <small>${cur()}</small></div>
          <div class="hero-sub">${num(s.usage, 1)} m³ used · ~<strong>${num(s.projUsage, 1)} m³</strong> projected · ${Math.ceil(s.daysLeft)} days left</div>
          <div class="hero-empty">So far: ${money(s.billSoFar, 0)} ${cur()} · ${num(s.rate, 2)} m³/day avg</div>
          <span class="ring ${lvl}">${ringTxt}</span></div>`;
      } else {
        html += `<div class="hero"><div class="hero-label">Used this cycle</div><div class="hero-big">${num(s.usage, 1)} <small>m³</small></div><div class="hero-sub">~<strong>${num(s.projUsage, 1)} m³</strong> projected · ${num(s.rate, 2)} m³/day</div><div class="hero-empty">Set your tariff (MT per m³) in Water settings to project the bill.</div></div>`;
      }
      const cards = [
        ['Used (cycle)', `${num(s.usage, 1)} <small>m³</small>`], ['Projected', `${num(s.projUsage, 1)} <small>m³</small>`],
        ['Avg / day', `${num(s.rate, 2)} <small>m³</small>`], ['Days left', `${Math.ceil(s.daysLeft)} <small>days</small>`],
        ['Meter now', `${num(s.meterNow, 1)} <small>m³</small>`], ['Bill so far', s.billSoFar != null ? `${money(s.billSoFar, 0)} <small>${cur()}</small>` : '– <small></small>']
      ];
      html += `<div class="stat-grid">${cards.map(([l, v]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('')}</div>`;
      if (lk.leak) html += `<div class="card" style="border-color:var(--bad)"><div class="a-line" style="color:var(--bad);font-weight:600">🚱 ${lk.reason}</div></div>`;
    }

    const rs = readings();
    html += `<div class="card"><div class="card-head"><h2>Meter readings</h2><span class="hint">${rs.length} readings</span></div><div class="chart">${HT.lineChart(rs.map(r => ({ t: r.t, y: r.m3 })), { yFromZero: false, empty: 'Log at least two m³ readings to see the trend.' })}</div></div>`;
    const ivv = intervals().filter(x => x.rate != null && x.consumed >= 0).slice(-14);
    html += `<div class="card"><div class="card-head"><h2>Daily water use</h2></div><div class="chart">${HT.barChart(ivv.map(d => ({ label: HT.fmtDate(d.end), value: d.rate, title: `${HT.fmtDate(d.end)}: ${num(d.rate, 2)} m³/day` })), { empty: 'Water use between readings appears here.', avgDec: 2 })}</div></div>`;

    const items = [...W().readings.map(r => ({ ...r, kind: 'reading' })), ...W().payments.map(r => ({ ...r, kind: 'payment' }))].sort((a, b) => t(b.t) - t(a.t));
    html += `<div class="card"><div class="card-head"><h2>History</h2><span class="hint">${W().readings.length} readings · ${W().payments.length} payments</span></div><div class="history-list">${items.length ? items.map(histRow).join('') : '<div class="empty" style="padding:14px 0">No entries yet.</div>'}</div></div>`;

    const st = W().settings;
    html += `<div class="card"><div class="card-head"><h2>Water settings</h2></div><form class="form" data-w="settings">
        <div class="row"><label class="field"><span>Tariff (${cur()} per m³)</span><input type="number" step="0.01" name="ratePerM3" value="${st.ratePerM3}"></label><label class="field"><span>Fixed charge (${cur()})</span><input type="number" step="0.01" name="fixed" value="${st.fixed}"></label></div>
        <div class="row"><label class="field"><span>Billing day</span><select name="cycleDay">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${st.cycleDay == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label><label class="field"><span>Average on last</span><select name="window">${[['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['0', 'All']].map(([v, l]) => `<option value="${v}" ${st.window == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="row"><label class="field"><span>Bill alert above (${cur()})</span><input type="number" step="1" name="alertBill" value="${st.alertBill || ''}"></label><label class="field"><span>Leak threshold (m³/day)</span><input type="number" step="0.1" name="leakPerDay" value="${st.leakPerDay || ''}"></label></div>
      </form><p class="hint" style="margin-top:8px">Leak threshold: your normal overnight/away baseline. Continuous use above it is flagged.</p></div>`;

    el.innerHTML = html;
  }
  function histRow(it) {
    if (it.kind === 'reading') return `<div class="hist-item"><div class="hist-icon read">▴</div><div class="hist-main"><div class="hist-title">${num(it.m3, 1)} m³ on meter</div><div class="hist-sub">${HT.fmtDateTime(it.t)} · ${HT.relTime(it.t)}</div></div><button class="hist-del" data-w="delReading" data-id="${it.id}">✕</button></div>`;
    return `<div class="hist-item"><div class="hist-icon recharge">💧</div><div class="hist-main"><div class="hist-title">Bill payment</div><div class="hist-sub">${HT.fmtDateTime(it.t)}${it.ref ? ' · ' + escapeHtml(it.ref) : ''}</div></div><div class="hist-right"><div class="hist-amt pos">${money(it.mt, 0)} ${cur()}</div></div><button class="hist-del" data-w="delPayment" data-id="${it.id}">✕</button></div>`;
  }

  /* ---------- quick add ---------- */
  function quickAdd() {
    const now = HT.toLocalInput(new Date());
    const body = `
      <div class="segmented" id="wqToggle"><button type="button" class="seg active" data-q="reading">Meter reading</button><button type="button" class="seg" data-q="payment">Bill payment</button></div>
      <form class="form" id="wqReading">
        <label class="field"><span>Meter reading (m³)</span><input type="number" step="0.1" inputmode="decimal" name="m3" placeholder="e.g. 1240.6" required></label>
        <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="time" value="${now}" required></label>
        <button class="btn btn-primary" type="submit">Save reading</button>
      </form>
      <form class="form hidden" id="wqPayment">
        <label class="field"><span>Amount paid (${cur()})</span><input type="number" step="0.01" inputmode="decimal" name="mt" placeholder="0" required></label>
        <label class="field"><span>Reference <em>opt</em></span><input type="text" name="ref" placeholder="FIPAG ref"></label>
        <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="time" value="${now}" required></label>
        <button class="btn btn-primary" type="submit">Save payment</button>
      </form>`;
    HT.openModal('Log water', body, (root) => {
      HT.$$('#wqToggle .seg', root).forEach(b => b.addEventListener('click', () => {
        HT.$$('#wqToggle .seg', root).forEach(x => x.classList.toggle('active', x === b));
        $('#wqReading', root).classList.toggle('hidden', b.dataset.q !== 'reading');
        $('#wqPayment', root).classList.toggle('hidden', b.dataset.q !== 'payment');
      }));
      $('#wqReading', root).addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const m3 = parseFloat(f.m3.value);
        if (isNaN(m3) || !f.time.value) return;
        W().readings.push({ id: uid(), t: f.time.value, m3 }); HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Reading saved');
      });
      $('#wqPayment', root).addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const mt = parseFloat(f.mt.value);
        if (isNaN(mt) || !f.time.value) return;
        const id = uid();
        W().payments.push({ id, t: f.time.value, mt, ref: f.ref.value.trim() });
        syncLink({ id, t: f.time.value, mt, ref: f.ref.value.trim() });
        HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Payment saved');
      });
    });
  }
  function syncLink(p) {
    if (HT.state.settings.linkUtilities === false) return;
    HT.linkExpense({ source: 'water', linkId: p.id, amount: p.mt, categoryName: 'Water', time: p.t, note: 'Water bill' + (p.ref ? ' · ' + p.ref : '') });
  }

  function init(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]'); if (!b || b.tagName === 'FORM') return;
      const act = b.dataset.w, id = b.dataset.id;
      if (act === 'delReading') { if (confirm('Delete this reading?')) { W().readings = W().readings.filter(x => x.id !== id); HT.save(); HT.refresh(); } }
      else if (act === 'delPayment') { if (confirm('Delete this payment?')) { W().payments = W().payments.filter(x => x.id !== id); HT.unlinkExpense('water', id); HT.save(); HT.refresh(); } }
    });
    el.addEventListener('change', (e) => {
      const form = e.target.closest('form[data-w="settings"]'); if (!form) return;
      const st = W().settings;
      st.ratePerM3 = parseFloat(form.ratePerM3.value) || 0; st.fixed = parseFloat(form.fixed.value) || 0;
      st.cycleDay = parseInt(form.cycleDay.value, 10) || 1; st.window = parseInt(form.window.value, 10);
      st.alertBill = parseFloat(form.alertBill.value) || 0; st.leakPerDay = parseFloat(form.leakPerDay.value) || 0;
      HT.save(); HT.refresh();
    });
  }

  HT.register('water', { title: 'Water', mark: '💧', sub: 'Metered water', quickAddLabel: 'Log water', render, init, quickAdd, alert, reconcile: () => { HT.pruneLinks('water', W().payments.map(p => p.id)); W().payments.forEach(p => syncLink(p)); } });
})(window.HT);
