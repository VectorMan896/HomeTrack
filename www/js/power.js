/* ============================================================
   HomeTrack — Power module (prepaid meter, counts DOWN)
   ============================================================ */
(function (HT) {
  const { $, uid, t, num, money, cur, escapeHtml } = HT;
  const DAY = HT.DAY;
  const DEFAULT_RATE = 8.4;
  const CAT_COLORS = { 'Always-on': '#38bdf8', 'Heating': '#f85149', 'Refrigeration': '#3fb950', 'Cooking': '#ffb703', 'Pumps': '#a78bfa', 'Lighting': '#fbbf24', 'Entertainment': '#f472b6', 'Laundry': '#22d3ee', 'Cooling': '#60a5fa', 'Other': '#94a3b8' };
  const P = () => HT.state.power;

  /* ---------- engine ---------- */
  const readings = () => [...P().readings].sort((a, b) => t(a.t) - t(b.t));
  const recharges = () => [...P().recharges].sort((a, b) => t(a.t) - t(b.t));

  function intervals() {
    const rs = readings(), rc = recharges(), out = [];
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1], b = rs[i];
      const added = rc.filter(r => t(r.t) > t(a.t) && t(r.t) <= t(b.t)).reduce((s, r) => s + r.kwh, 0);
      const consumed = a.kwh + added - b.kwh;
      const days = (t(b.t) - t(a.t)) / DAY;
      out.push({ start: a.t, end: b.t, consumed, added, days, rate: days > 0 ? consumed / days : null });
    }
    return out;
  }
  // Keep only trustworthy reading-intervals (real consumption, positive span).
  function cleanIntervals() {
    let ivs = intervals().filter(iv => iv.rate != null && iv.consumed >= 0 && iv.days > 0);
    // Guard against a mistyped reading skewing everything: once there are enough
    // samples, drop intervals whose rate is wildly off the median.
    if (ivs.length >= 5) {
      const sorted = ivs.map(iv => iv.rate).sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
      if (med > 0) ivs = ivs.filter(iv => iv.rate <= med * 6 && iv.rate >= med / 6);
    }
    return ivs;
  }
  // Recency-weighted pooled rate: recent days count more, so the forecast keeps up
  // with how usage changes. Longer intervals still carry proportionally more weight.
  function weightedRate(ivs, halflife) {
    const now = Date.now(); let wc = 0, wd = 0;
    for (const iv of ivs) {
      const age = Math.max(0, (now - t(iv.end)) / DAY);
      const w = halflife > 0 ? Math.exp(-age / halflife) : 1;
      wc += w * iv.consumed; wd += w * iv.days;
    }
    return wd > 0 ? wc / wd : null;
  }
  // Cold-start estimate learned from top-ups, before there are two readings to compare.
  // Energy burned between the first and last recharge ≈ everything added except the most
  // recent top-up (assuming you recharge at a similar low level each time).
  function rechargeThroughput() {
    const rc = recharges().filter(r => r.kwh > 0);
    if (rc.length < 2) return null;
    const spanDays = (t(rc[rc.length - 1].t) - t(rc[0].t)) / DAY;
    if (spanDays < 1) return null;
    const burned = rc.slice(0, -1).reduce((s, r) => s + r.kwh, 0);
    const rate = burned / spanDays;
    return rate > 0 && isFinite(rate) ? { rate, days: spanDays, samples: rc.length } : null;
  }
  const plural = (n) => n === 1 ? '' : 's';
  // The learned daily consumption rate. Priority: your readings → your recharges →
  // appliances (only a hint) → the assumed default. Appliances never override real usage.
  function avgDailyRate() {
    const win = P().settings.window;
    const cutoff = win > 0 ? Date.now() - win * DAY : -Infinity;
    const ivs = cleanIntervals();
    const inWin = ivs.filter(iv => t(iv.end) >= cutoff);
    const pick = inWin.length ? inWin : ivs;
    if (pick.length) {
      const halflife = win > 0 ? Math.max(3, win / 2) : 30;
      const rate = weightedRate(pick, halflife);
      const scope = inWin.length && win > 0 ? `last ${win} days` : 'all readings';
      return { rate, basis: `learned from ${pick.length} reading${plural(pick.length)} · ${scope}`, samples: pick.length, source: 'readings' };
    }
    const rt = rechargeThroughput();
    if (rt) return { rate: rt.rate, basis: `learned from your ${rt.samples} recharges`, samples: rt.samples, source: 'recharges' };
    const modeled = modeledTotal();
    if (modeled > 0) return { rate: modeled, basis: 'estimated from appliances · log a 2nd reading to learn', samples: P().appliances.length, source: 'appliances' };
    return { rate: P().settings.assumed, basis: 'default · log readings to learn', samples: 0, source: 'assumed' };
  }
  function latestRate() {
    const rc = recharges();
    for (let i = rc.length - 1; i >= 0; i--) if (rc[i].kwh > 0) return rc[i].mt / rc[i].kwh;
    return DEFAULT_RATE;
  }
  function situation() {
    const rs = readings(); const { rate, basis, samples, source } = avgDailyRate();
    if (!rs.length) return { hasData: false, rate, basis, samples, source };
    const anchor = rs[rs.length - 1];
    const addedSince = recharges().filter(r => t(r.t) > t(anchor.t)).reduce((s, r) => s + r.kwh, 0);
    const daysSince = Math.max(0, (Date.now() - t(anchor.t)) / DAY);
    const estimated = Math.max(0, anchor.kwh + addedSince - rate * daysSince);
    const daysRemaining = rate > 0 ? estimated / rate : Infinity;
    const emptyAt = rate > 0 ? new Date(Date.now() + daysRemaining * DAY) : null;
    return { hasData: true, rate, basis, samples, source, anchor, estimated, daysRemaining, emptyAt, ratePerKwh: latestRate() };
  }
  function alertLevel(s) {
    if (!s.hasData) return 'none';
    if (s.daysRemaining <= P().settings.alertDays || s.estimated <= P().settings.alertKwh * 0.5) return 'bad';
    if (s.estimated <= P().settings.alertKwh) return 'warn';
    return 'good';
  }
  const applianceKwh = (a) => a.watts * a.qty * a.hours * (a.days / 7) / 1000;
  const modeledTotal = () => P().appliances.reduce((s, a) => s + applianceKwh(a), 0);

  /* ---------- monthly cost ---------- */
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  // Price of a kWh at a moment = rate of the latest recharge before it (tariffs change over time).
  function rateAt(time, rc) {
    let rate = rc.length ? rc[0].mt / rc[0].kwh : DEFAULT_RATE;
    for (const r of rc) { if (t(r.t) <= time) rate = r.mt / r.kwh; else break; }
    return rate;
  }
  // Spread each measured interval's kWh evenly over the calendar days it covers.
  function dailyUse() {
    const rc = recharges().filter(r => r.kwh > 0), days = {};
    intervals().filter(iv => iv.consumed >= 0 && iv.days > 0).forEach(iv => {
      let a = t(iv.start); const b = t(iv.end), perMs = iv.consumed / (b - a);
      while (a < b) {
        const d = new Date(a), next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const end = Math.min(next, b), k = (end - a) * perMs;
        const e = days[dayKey(d)] || (days[dayKey(d)] = { kwh: 0, cost: 0, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) });
        e.kwh += k; e.cost += k * rateAt(a, rc); a = end;
      }
    });
    return days;
  }
  // Last n calendar months (oldest first): measured kWh + cost, and cash spent on recharges.
  function monthly(n) {
    const du = dailyUse(), now = new Date(), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      let kwh = 0, cost = 0, covered = 0;
      for (let d = new Date(s); d < e && d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const x = du[dayKey(d)]; if (x) { kwh += x.kwh; cost += x.cost; covered++; }
      }
      const spent = P().recharges.filter(r => t(r.t) >= s.getTime() && t(r.t) < e.getTime()).reduce((a, r) => a + r.mt, 0);
      out.push({ start: s, end: e, kwh, cost, covered, spent, daysInMonth: Math.round((e - s) / DAY) });
    }
    return out;
  }
  // This month: measured so far + estimate since the last reading, projected to month end at the avg rate.
  function monthProjection() {
    const s = situation(), m = monthly(1)[0], now = Date.now();
    const price = s.ratePerKwh || latestRate();
    const gapFrom = Math.max(m.start.getTime(), s.hasData ? t(s.anchor.t) : now);
    const gapKwh = s.rate * Math.max(0, now - gapFrom) / DAY;
    const daysLeft = Math.max(0, (m.end.getTime() - now) / DAY);
    const usedKwh = m.kwh + gapKwh, usedCost = m.cost + gapKwh * price;
    return { month: m, usedKwh, usedCost, projKwh: usedKwh + s.rate * daysLeft, projCost: usedCost + s.rate * daysLeft * price, daysLeft, spent: m.spent };
  }
  function stats() {
    const rc = recharges(), du = Object.values(dailyUse());
    const full = monthly(13).slice(0, -1).filter(m => m.covered >= m.daysInMonth * 0.8);   // complete past months only
    const gaps = rc.slice(1).map((r, i) => (t(r.t) - t(rc[i].t)) / DAY);
    const peak = du.reduce((b, d) => (!b || d.kwh > b.kwh ? d : b), null);
    const paid = rc.reduce((a, r) => a + r.mt, 0), kwh = rc.reduce((a, r) => a + r.kwh, 0);
    const priced = rc.filter(r => r.kwh > 0);
    return {
      avgMonth: full.length ? full.reduce((a, m) => a + m.cost, 0) / full.length : null, fullMonths: full.length,
      avgRecharge: rc.length ? paid / rc.length : null,
      every: gaps.length ? gaps.reduce((a, g) => a + g, 0) / gaps.length : null,
      peak, avgPrice: kwh > 0 ? paid / kwh : null,
      firstPrice: priced.length ? priced[0].mt / priced[0].kwh : null, lastPrice: priced.length ? priced[priced.length - 1].mt / priced[priced.length - 1].kwh : null
    };
  }

  HT.power = { situation, alertLevel, intervals, monthly, monthProjection, stats };

  /* ---------- alert for aggregation ---------- */
  function alert() {
    const s = situation(); const lvl = alertLevel(s);
    if (lvl === 'good' || lvl === 'none') return null;
    const days = s.daysRemaining === Infinity ? '' : ` (~${num(s.daysRemaining, 1)} days)`;
    return { level: lvl, module: 'power', text: `⚡ ${lvl === 'bad' ? 'Low power' : 'Power getting low'} — ~${num(s.estimated, 0)} kWh left${days}. Recharge${lvl === 'bad' ? ' now' : ' soon'}.` };
  }

  /* ---------- render ---------- */
  function render(el) {
    const s = situation();
    let html = '';

    // hero
    if (!s.hasData) {
      html += `<div class="hero"><div class="hero-label">Get started</div><div class="hero-sub" style="margin-top:8px">Tap ＋ to log the remaining kWh shown on your prepaid meter.</div></div>`;
    } else {
      const lvl = alertLevel(s);
      const ringTxt = lvl === 'bad' ? 'Recharge now' : lvl === 'warn' ? 'Recharge soon' : 'Healthy';
      const daysTxt = s.daysRemaining === Infinity ? '—' : num(s.daysRemaining, 1);
      const empty = s.emptyAt ? `Estimated empty <strong>${s.emptyAt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>` : 'Add more readings to project the empty date';
      html += `<div class="hero">
        <div class="hero-label">Estimated days remaining</div>
        <div class="hero-big">${daysTxt} <small>days</small></div>
        <div class="hero-sub">≈ <strong>${num(s.estimated, 1)} kWh</strong> left · ${num(s.rate, 1)} kWh/day (${s.basis})</div>
        <div class="hero-empty">${empty}</div>
        <span class="ring ${lvl}">${ringTxt}</span></div>`;

      // stats
      const valueLeft = s.estimated * s.ratePerKwh, costDay = s.rate * s.ratePerKwh;
      const iv = intervals(); const lastIv = iv.length ? iv[iv.length - 1] : null;
      const recent = lastIv && lastIv.rate != null ? num(lastIv.rate, 1) : '–';
      const totalSpent = P().recharges.reduce((a, r) => a + r.mt, 0);
      const cards = [
        ['Avg use', `${num(s.rate, 1)} <small>kWh/d</small>`], ['Last period', `${recent} <small>kWh/d</small>`],
        ['Value left', `${money(valueLeft, 0)} <small>${cur()}</small>`], ['Cost / day', `${money(costDay, 0)} <small>${cur()}</small>`],
        ['Rate', `${money(s.ratePerKwh, 2)} <small>/kWh</small>`], ['Total spent', `${money(totalSpent, 0)} <small>${cur()}</small>`]
      ];
      html += `<div class="stat-grid">${cards.map(([l, v]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('')}</div>`;
      html += monthCards(s);
    }

    // charts
    const rs = readings();
    html += `<div class="card"><div class="card-head"><h2>Remaining energy</h2><span class="hint">${rs.length} readings</span></div><div class="chart">${HT.lineChart(rs.map(r => ({ t: r.t, y: r.kwh })), { marks: recharges().map(r => t(r.t)), empty: 'Log at least two readings to see the curve.' })}</div></div>`;
    const ivv = intervals().filter(x => x.rate != null && x.consumed >= 0).slice(-14);
    html += `<div class="card"><div class="card-head"><h2>Daily consumption</h2></div><div class="chart">${HT.barChart(ivv.map(d => ({ label: HT.fmtDate(d.end), value: d.rate, title: `${HT.fmtDate(d.end)}: ${num(d.rate, 1)} kWh/day` })), { empty: 'Consumption between readings appears here.', avgDec: 1 })}</div></div>`;

    // history
    const items = [...P().readings.map(r => ({ ...r, kind: 'reading' })), ...P().recharges.map(r => ({ ...r, kind: 'recharge' }))].sort((a, b) => t(b.t) - t(a.t));
    html += `<div class="card"><div class="card-head"><h2>History</h2><span class="hint">${P().readings.length} readings · ${P().recharges.length} recharges</span></div><div class="history-list">${items.length ? items.map(histRow).join('') : '<div class="empty" style="padding:14px 0">No entries yet.</div>'}</div></div>`;

    // appliances
    const list = P().appliances.map(a => ({ ...a, kwh: applianceKwh(a) })).sort((x, y) => y.kwh - x.kwh);
    const total = list.reduce((s2, a) => s2 + a.kwh, 0);
    // "Measured" means a rate actually learned from your readings/recharges — not the
    // appliance model standing in at cold start (that would trivially "match itself").
    const measured = (s.source === 'readings' || s.source === 'recharges') ? s.rate : null;
    let modelHint = 'Tune each appliance to match reality; the bar shows the mix by category.';
    if (measured != null && total > 0) { const diff = measured - total; const pct = Math.abs(diff / total * 100); modelHint = Math.abs(diff) < 0.5 ? 'Your appliance model closely matches measured usage. 👌' : diff > 0 ? `Measured use is ${num(diff, 1)} kWh/day (${num(pct, 0)}%) above modeled.` : `Measured use is ${num(-diff, 1)} kWh/day (${num(pct, 0)}%) below modeled.`; }
    if (total > 0) modelHint += ' The days-remaining forecast always uses your readings — this model is just for comparison.';
    html += `<div class="card summary-card">
        <div class="summary-row"><div><span class="summary-label">Modeled/day</span><span class="summary-value">${num(total, 1)}</span></div><div><span class="summary-label">Measured/day</span><span class="summary-value">${measured != null ? num(measured, 1) : '–'}</span></div></div>
        <div class="model-bar">${list.map(a => `<i style="width:${total ? a.kwh / total * 100 : 0}%;background:${CAT_COLORS[a.category] || '#888'}"></i>`).join('')}</div>
        <p class="hint" style="margin-top:8px">${modelHint}</p></div>`;
    html += `<div class="card"><div class="card-head"><h2>Appliances</h2><button class="btn btn-sm" data-p="addAppliance">＋ Add</button></div><div class="row-list">${list.map(a => `
        <div class="li" data-p="editAppliance" data-id="${a.id}"><div class="li-swatch" style="background:${CAT_COLORS[a.category] || '#888'}"></div>
        <div class="li-main"><div class="li-name">${escapeHtml(a.name)}</div><div class="li-meta">${a.qty > 1 ? a.qty + '× ' : ''}${num(a.watts, 0)} W · ${num(a.hours, 1)} h/day${a.days < 7 ? ' · ' + num(a.days, 1) + ' d/wk' : ''}</div></div>
        <div class="li-right"><div class="li-amt">${num(a.kwh, 2)}</div><div class="li-sub">${total ? num(a.kwh / total * 100, 0) : 0}%</div></div></div>`).join('')}</div></div>`;

    // settings
    const st = P().settings;
    html += `<div class="card"><div class="card-head"><h2>Power settings</h2></div><form class="form" data-p="settings">
        <div class="row"><label class="field"><span>Alert below (kWh)</span><input type="number" step="1" name="alertKwh" value="${st.alertKwh}"></label><label class="field"><span>…or below (days)</span><input type="number" step="0.5" name="alertDays" value="${st.alertDays}"></label></div>
        <div class="row"><label class="field"><span>Learn from last</span><select name="window">${[['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['0', 'All history']].map(([v, l]) => `<option value="${v}" ${st.window == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Starting estimate kWh/day <em>until it learns</em></span><input type="number" step="0.1" name="assumed" value="${st.assumed}"></label></div>
      </form></div>`;

    el.innerHTML = html;
  }
  const monthName = (d, long) => d.toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  const pctChange = (a, b) => (b > 0 ? Math.round((a - b) / b * 100) : null);

  function monthCards(s) {
    let html = '';
    const mp = monthProjection(), months = monthly(6), last = months[months.length - 2];
    const cat = HT.budgetCatByName('Electricity') || HT.budgetCatByName('Power');
    const budget = cat && cat.budget > 0 ? cat.budget : 0;

    // This month: so far, projection, vs last month, vs Electricity budget
    const vsLast = last && last.covered >= last.daysInMonth * 0.8 ? pctChange(mp.projCost, last.cost) : null;
    const vsTxt = vsLast == null ? '' : `<p class="hint" style="margin-top:8px">${vsLast === 0 ? 'Same pace as' : (vsLast > 0 ? `▲ ${vsLast}% more than` : `▼ ${-vsLast}% less than`)} ${monthName(last.start, true)} (${money(last.cost, 0)} ${cur()}).</p>`;
    const pct = budget ? mp.projCost / budget : 0;
    const budgetTxt = budget ? `<div class="progress" style="margin-top:10px"><i style="width:${Math.min(100, pct * 100)}%;background:${HT.barColor(pct)}"></i></div><p class="hint" style="margin-top:6px">Projected ${Math.round(pct * 100)}% of your ${money(budget, 0)} ${cur()} Electricity budget.</p>` : '';
    html += `<div class="card summary-card"><div class="card-head"><h2>This month</h2><span class="hint">${monthName(mp.month.start, true)} · ${Math.ceil(mp.daysLeft)} days left</span></div>
      <div class="summary-row">
        <div><span class="summary-label">Used so far</span><span class="summary-value">${money(mp.usedCost, 0)} <small>${cur()}</small></span><span class="hint">${num(mp.usedKwh, 0)} kWh</span></div>
        <div><span class="summary-label">Projected month</span><span class="summary-value">${money(mp.projCost, 0)} <small>${cur()}</small></span><span class="hint">~${num(mp.projKwh, 0)} kWh</span></div>
      </div>${budgetTxt}${vsTxt}
      <p class="hint" style="margin-top:6px">Recharged this month: ${money(mp.spent, 0)} ${cur()}. Cost is the energy you used × your recharge price.</p></div>`;

    // Monthly cost chart + table (current month shows the projection in the tooltip)
    const data = months.map((m, i) => {
      const cur_ = i === months.length - 1;
      const v = cur_ ? mp.usedCost : m.cost;
      return { label: monthName(m.start), value: v, title: `${monthName(m.start, true)}: ${money(v, 0)} ${cur()} · ${num(cur_ ? mp.usedKwh : m.kwh, 0)} kWh${cur_ ? ` (so far — projected ${money(mp.projCost, 0)})` : (m.covered < m.daysInMonth * 0.8 ? ` (only ${m.covered} of ${m.daysInMonth} days measured)` : '')}` };
    });
    const rows = months.slice().reverse().filter(m => m.kwh > 0 || m.spent > 0).map((m, i) => {
      const isCur = i === 0 && m === months[months.length - 1];
      const cost = isCur ? mp.usedCost : m.cost, kwh = isCur ? mp.usedKwh : m.kwh;
      const partial = !isCur && m.covered < m.daysInMonth * 0.8 ? ` · ${m.covered}/${m.daysInMonth} days measured` : '';
      return `<div class="li" style="cursor:default"><div class="li-main"><div class="li-name">${monthName(m.start, true)}${isCur ? ' <span class="badge">so far</span>' : ''}</div><div class="li-sub">${num(kwh, 0)} kWh · ${num(kwh / (isCur ? Math.max(1, (Date.now() - m.start) / DAY) : m.daysInMonth), 1)} kWh/day${partial}</div></div><div class="li-right"><div class="li-amt">${money(cost, 0)} ${cur()}</div><div class="li-sub">recharged ${money(m.spent, 0)}</div></div></div>`;
    }).join('');
    html += `<div class="card"><div class="card-head"><h2>Monthly cost</h2><span class="hint">last 6 months</span></div><div class="chart">${HT.barChart(data, { empty: 'Monthly cost appears once you have readings across a month.', avgDec: 0 })}</div>${rows ? `<div class="row-list" style="margin-top:8px">${rows}</div>` : ''}</div>`;

    // Extra stats
    const st = stats();
    const priceChg = st.firstPrice && st.lastPrice ? pctChange(st.lastPrice, st.firstPrice) : null;
    const cards = [
      ['Avg / month', st.avgMonth != null ? `${money(st.avgMonth, 0)} <small>${cur()}</small>` : '– <small>need a full month</small>'],
      ['Projected / year', `${money(st.avgMonth != null ? st.avgMonth * 12 : mp.projCost * 12, 0)} <small>${cur()}</small>`],
      ['Avg recharge', st.avgRecharge != null ? `${money(st.avgRecharge, 0)} <small>${cur()}</small>` : '–'],
      ['Recharge every', st.every != null ? `${num(st.every, 1)} <small>days</small>` : '–'],
      ['Peak day', st.peak ? `${num(st.peak.kwh, 1)} <small>kWh · ${HT.fmtDate(st.peak.date.toISOString())}</small>` : '–'],
      ['Price change', priceChg != null ? `${priceChg > 0 ? '+' : ''}${priceChg}% <small>since first</small>` : '–']
    ];
    html += `<div class="card"><div class="card-head"><h2>Power stats</h2></div><div class="stat-grid" style="margin:0">${cards.map(([l, v]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('')}</div></div>`;
    return html;
  }

  function histRow(it) {
    if (it.kind === 'reading') return `<div class="hist-item"><div class="hist-icon read">▾</div><div class="hist-main"><div class="hist-title">${num(it.kwh, 1)} kWh on meter</div><div class="hist-sub">${HT.fmtDateTime(it.t)} · ${HT.relTime(it.t)}</div></div><button class="hist-del" data-p="delReading" data-id="${it.id}">✕</button></div>`;
    const rate = it.kwh > 0 ? it.mt / it.kwh : 0;
    return `<div class="hist-item"><div class="hist-icon recharge">＋</div><div class="hist-main"><div class="hist-title">Recharge · +${num(it.kwh, 1)} kWh</div><div class="hist-sub">${HT.fmtDateTime(it.t)} · ${money(rate, 2)} ${cur()}/kWh${it.ref ? ' · ' + escapeHtml(it.ref) : ''}</div></div><div class="hist-right"><div class="hist-amt pos">${money(it.mt, 0)} ${cur()}</div></div><button class="hist-del" data-p="delRecharge" data-id="${it.id}">✕</button></div>`;
  }

  /* ---------- quick add (modal) ---------- */
  let qType = 'reading';
  function quickAdd() {
    const now = HT.toLocalInput(new Date());
    const body = `
      <div class="segmented" id="pqToggle"><button type="button" class="seg active" data-q="reading">Meter reading</button><button type="button" class="seg" data-q="recharge">Recharge</button></div>
      <form class="form" id="pqReading">
        <label class="field"><span>Remaining kWh on meter</span><input type="number" step="0.1" inputmode="decimal" name="kwh" placeholder="e.g. 190.5" required></label>
        <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="time" value="${now}" required></label>
        <button class="btn btn-primary" type="submit">Save reading</button>
      </form>
      <form class="form hidden" id="pqRecharge">
        <div class="row"><label class="field"><span>Paid (${cur()})</span><input type="number" step="0.01" inputmode="decimal" name="mt" placeholder="2000" required></label><label class="field"><span>Energy (kWh)</span><input type="number" step="0.1" inputmode="decimal" name="kwh" placeholder="238.2" required></label></div>
        <div class="row"><label class="field"><span>IVA <em>opt</em></span><input type="number" step="0.01" name="iva" placeholder="180.49"></label><label class="field"><span>Fees <em>opt</em></span><input type="number" step="0.01" name="fees" placeholder="0"></label></div>
        <label class="field"><span>Reference <em>opt</em></span><input type="text" name="ref" placeholder="202608280122232376"></label>
        <label class="field"><span>Date &amp; time</span><input type="datetime-local" name="time" value="${now}" required></label>
        <p class="rate-preview" id="pqRate"></p>
        <button class="btn btn-primary" type="submit">Save recharge</button>
      </form>`;
    HT.openModal('Log power', body, (root) => {
      qType = 'reading';
      HT.$$('#pqToggle .seg', root).forEach(b => b.addEventListener('click', () => {
        qType = b.dataset.q;
        HT.$$('#pqToggle .seg', root).forEach(x => x.classList.toggle('active', x === b));
        $('#pqReading', root).classList.toggle('hidden', qType !== 'reading');
        $('#pqRecharge', root).classList.toggle('hidden', qType !== 'recharge');
      }));
      const rc = $('#pqRecharge', root);
      const upd = () => { const mt = parseFloat(rc.mt.value), k = parseFloat(rc.kwh.value); $('#pqRate', root).textContent = (mt > 0 && k > 0) ? `Rate: ${money(mt / k, 2)} ${cur()}/kWh · meter jumps +${num(k, 1)} kWh` : ''; };
      rc.mt.addEventListener('input', upd); rc.kwh.addEventListener('input', upd);
      $('#pqReading', root).addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const kwh = parseFloat(f.kwh.value);
        if (isNaN(kwh) || !f.time.value) return;
        P().readings.push({ id: uid(), t: f.time.value, kwh }); HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Reading saved');
      });
      rc.addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const mt = parseFloat(f.mt.value), kwh = parseFloat(f.kwh.value);
        if (isNaN(mt) || isNaN(kwh) || !f.time.value) return;
        const id = uid();
        P().recharges.push({ id, t: f.time.value, mt, kwh, iva: parseFloat(f.iva.value) || 0, fees: parseFloat(f.fees.value) || 0, ref: f.ref.value.trim() });
        syncLink({ id, t: f.time.value, mt, ref: f.ref.value.trim() });
        HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Recharge saved');
      });
    });
  }
  function syncLink(r) {
    if (HT.state.settings.linkUtilities === false) return;
    const catName = HT.budgetCatByName('Electricity') ? 'Electricity' : (HT.budgetCatByName('Power') ? 'Power' : 'Electricity');
    HT.linkExpense({ source: 'power', linkId: r.id, amount: r.mt, categoryName: catName, time: r.t, note: 'Credelec recharge' + (r.ref ? ' · ' + r.ref : '') });
  }

  /* ---------- interactions ---------- */
  function init(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const act = b.dataset.p, id = b.dataset.id;
      if (act === 'delReading') { if (confirm('Delete this reading?')) { P().readings = P().readings.filter(x => x.id !== id); HT.save(); HT.refresh(); } }
      else if (act === 'delRecharge') { if (confirm('Delete this recharge?')) { P().recharges = P().recharges.filter(x => x.id !== id); HT.unlinkExpense('power', id); HT.save(); HT.refresh(); } }
      else if (act === 'addAppliance') applianceModal(null);
      else if (act === 'editAppliance') applianceModal(id);
    });
    el.addEventListener('change', (e) => {
      const form = e.target.closest('form[data-p="settings"]'); if (!form) return;
      const st = P().settings;
      st.alertKwh = parseFloat(form.alertKwh.value) || 0; st.alertDays = parseFloat(form.alertDays.value) || 0;
      st.window = parseInt(form.window.value, 10); st.assumed = parseFloat(form.assumed.value) || 23.8;
      HT.save(); HT.refresh();
    });
  }
  function applianceModal(id) {
    const a = id ? P().appliances.find(x => x.id === id) : null;
    const cats = ['Always-on', 'Heating', 'Cooling', 'Refrigeration', 'Cooking', 'Pumps', 'Lighting', 'Entertainment', 'Laundry', 'Other'];
    // [name, watts, category, typical hours/day] — pre-fill only, all editable after
    const PRESETS = [
      ['Fridge / freezer', 120, 'Refrigeration', 10], ['Chest freezer', 150, 'Refrigeration', 9],
      ['Water heater (geyser)', 3000, 'Heating', 2.3], ['Air conditioner', 1500, 'Cooling', 4], ['Fan', 60, 'Cooling', 6],
      ['Induction stove', 2000, 'Cooking', 0.8], ['Electric kettle', 2000, 'Cooking', 0.2], ['Microwave', 1000, 'Cooking', 0.3], ['Oven', 2200, 'Cooking', 0.5],
      ['Washing machine', 500, 'Laundry', 1], ['Iron', 1200, 'Laundry', 0.3],
      ['TV', 100, 'Entertainment', 5], ['Gaming PC', 400, 'Entertainment', 4], ['Desktop PC', 200, 'Always-on', 8], ['Laptop', 65, 'Always-on', 8],
      ['Wi-Fi router', 10, 'Always-on', 24], ['LED bulb', 9, 'Lighting', 5], ['Water pump', 750, 'Pumps', 1.2], ['Pool pump', 1100, 'Pumps', 4], ['Phone charger', 10, 'Always-on', 3]
    ];
    const body = `<form class="form" id="apForm">
      ${a ? '' : `<label class="field"><span>Quick pick <em>optional — fills the fields below</em></span><select id="apPreset"><option value="">— Custom / pick a common appliance —</option>${PRESETS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join('')}</select></label>`}
      <label class="field"><span>Name</span><input name="name" value="${a ? escapeHtml(a.name) : ''}" required></label>
      <div class="row"><label class="field"><span>Power (W)</span><input type="number" step="1" name="watts" value="${a ? a.watts : ''}" required></label><label class="field"><span>Quantity</span><input type="number" step="1" name="qty" value="${a ? a.qty : 1}" required></label></div>
      <div class="row"><label class="field"><span>Hours/day <em>ON</em></span><input type="number" step="0.1" name="hours" value="${a ? a.hours : ''}" required></label><label class="field"><span>Days/week</span><input type="number" step="0.5" min="0" max="7" name="days" value="${a ? a.days : 7}" required></label></div>
      <label class="field"><span>Category</span><select name="category">${cats.map(c => `<option ${a && a.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <p class="rate-preview" id="apPrev"></p>
      <div class="btn-col"><button class="btn btn-primary" type="submit">Save</button>${a ? '<button type="button" class="btn btn-danger" id="apDel">Delete</button>' : ''}</div></form>`;
    HT.openModal(a ? 'Edit appliance' : 'Add appliance', body, (root) => {
      const f = $('#apForm', root);
      const upd = () => { const w = parseFloat(f.watts.value), q = parseFloat(f.qty.value), h = parseFloat(f.hours.value), d = parseFloat(f.days.value); $('#apPrev', root).textContent = (w > 0 && q > 0 && h >= 0 && d >= 0) ? `≈ ${num(w * q * h * (d / 7) / 1000, 2)} kWh/day` : ''; };
      ['watts', 'qty', 'hours', 'days'].forEach(n => f[n].addEventListener('input', upd)); upd();
      const preset = $('#apPreset', root);
      if (preset) preset.addEventListener('change', () => {
        if (preset.value === '') return;
        const p = PRESETS[+preset.value];
        f.name.value = p[0]; f.watts.value = p[1]; f.category.value = p[2]; f.hours.value = p[3];
        upd();
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = { name: f.name.value.trim(), watts: parseFloat(f.watts.value) || 0, qty: parseInt(f.qty.value, 10) || 1, hours: parseFloat(f.hours.value) || 0, days: isNaN(parseFloat(f.days.value)) ? 7 : Math.max(0, Math.min(7, parseFloat(f.days.value))), category: f.category.value };
        if (!data.name) return;
        if (a) Object.assign(a, data); else P().appliances.push({ id: uid(), ...data });
        HT.save(); HT.closeModal(); HT.refresh(); HT.toast('Appliance saved');
      });
      if (a) $('#apDel', root).addEventListener('click', () => { if (confirm('Delete this appliance?')) { P().appliances = P().appliances.filter(x => x.id !== a.id); HT.save(); HT.closeModal(); HT.refresh(); } });
    });
  }

  HT.register('power', { title: 'Power', mark: '⚡', sub: 'Prepaid electricity', quickAddLabel: 'Log power', render, init, quickAdd, alert, reconcile: () => { HT.pruneLinks('power', P().recharges.map(r => r.id)); P().recharges.forEach(r => syncLink(r)); } });
})(window.HT);
