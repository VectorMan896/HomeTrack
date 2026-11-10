/* ============================================================
   HomeTrack — notifications (Android local notifications)
   Schedules a "power running low" notification for the predicted
   date so it fires even when the app is closed. No-op in a browser.
   ============================================================ */
(function (HT) {
  const DAY = HT.DAY;
  const LN = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const available = () => native() && !!LN();

  async function ensurePerm() {
    const ln = LN(); if (!ln) return false;
    try { let p = await ln.checkPermissions(); if (p.display !== 'granted') p = await ln.requestPermissions(); return p.display === 'granted'; }
    catch (e) { return false; }
  }
  async function requestPerm() { return ensurePerm(); }

  const parseHM = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || '20:00'); return { hour: m ? +m[1] : 20, minute: m ? +m[2] : 0 }; };

  // An alert that is already due gets scheduled a few seconds out. Do that at most once a day
  // per alert and never cancel it once armed — otherwise every screen refresh re-arms it
  // (repeated pings), or cancels it before it fires.
  const today = () => new Date().toDateString();
  const firedKey = (tag) => 'hometrack.notified.' + tag;
  function firedToday(tag) { try { return localStorage.getItem(firedKey(tag)) === today(); } catch (e) { return false; } }
  function markFired(tag) { try { localStorage.setItem(firedKey(tag), today()); } catch (e) {} }

  async function doSync() {
    const ln = LN(); if (!ln) return;
    const S = HT.state.settings;
    const rem = S.reminders || {};
    const wantAlerts = !!S.notify;
    const jobs = [], cancel = [10, 11];   // reminders are always rebuilt
    // allowWhileIdle: use a waking alarm. Without it Android holds the alert until you next
    // unlock the phone, which is why warnings seemed to never come.
    const W = (sch) => Object.assign(sch, { allowWhileIdle: true });
    const soon = () => new Date(Date.now() + 5000);

    // Power meter low → schedule for (predicted empty − alertDays)
    let power = null;
    try {
      const s = wantAlerts && HT.power.situation();
      if (s && s.hasData && s.rate > 0 && s.emptyAt) {
        const alertDays = HT.state.power.settings.alertDays || 2;
        const at = new Date(s.emptyAt.getTime() - alertDays * DAY);
        power = { at, emptyAt: s.emptyAt, due: at.getTime() <= Date.now() + 5000, body: `About ${Math.max(0, Math.round(s.daysRemaining))} days of electricity left — time to recharge.` };
      }
    } catch (e) {}
    if (!power) cancel.push(1);
    else if (!power.due) { cancel.push(1); jobs.push({ id: 1, title: 'Power running low ⚡', body: power.body, schedule: W({ at: power.at }), smallIcon: 'ic_launcher' }); }
    else if (!firedToday('power')) { cancel.push(1); markFired('power'); jobs.push({ id: 1, title: 'Power running low ⚡', body: power.body, schedule: W({ at: soon() }), smallIcon: 'ic_launcher' }); }

    // Second, last-chance warning on the morning of the predicted empty day (08:00), if still ahead.
    if (power) {
      const e = power.emptyAt, morning = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 8, 0);
      const at3 = morning.getTime() > Date.now() + 60000 ? morning : (e.getTime() > Date.now() + 60000 ? new Date(e.getTime() - 3 * 3600000) : null);
      cancel.push(3);
      if (at3 && at3.getTime() > Date.now() + 60000 && at3.getTime() > power.at.getTime()) jobs.push({ id: 3, title: 'Power runs out today ⚡', body: 'Your meter is predicted to run empty today — recharge now to avoid a cut.', schedule: W({ at: at3 }), smallIcon: 'ic_launcher' });
    } else cancel.push(3);

    let leak = null;
    try { leak = wantAlerts && HT.water && HT.water.leakCheck && HT.water.leakCheck(); } catch (e) {}
    if (!(leak && leak.leak)) cancel.push(2);
    else if (!firedToday('leak')) { cancel.push(2); markFired('leak'); jobs.push({ id: 2, title: 'Possible water leak 💧', body: leak.reason, schedule: W({ at: soon() }), smallIcon: 'ic_launcher' }); }

    // Daily reminders (repeat every day at the chosen time)
    if (rem.power && rem.power.on) jobs.push({ id: 10, title: 'Log your power meter ⚡', body: "Add today's remaining kWh to keep your prediction accurate.", schedule: W({ on: parseHM(rem.power.time), repeats: true }), smallIcon: 'ic_launcher' });
    if (rem.budget && rem.budget.on) jobs.push({ id: 11, title: "Log today's spending 💰", body: 'A quick tap to record what you spent today.', schedule: W({ on: parseHM(rem.budget.time), repeats: true }), smallIcon: 'ic_launcher' });

    try { await ln.cancel({ notifications: cancel.map(id => ({ id })) }); } catch (e) {}
    if (!jobs.length || !(await ensurePerm())) return;
    try { await ln.schedule({ notifications: jobs }); } catch (e) {}
  }

  let timer = null;
  function sync() { clearTimeout(timer); timer = setTimeout(doSync, 1200); }

  const AH = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AlertHealth) || null;
  async function health() {
    const ah = AH(); let st = { batteryOk: true, exactOk: true, manufacturer: '' };
    if (ah) { try { st = Object.assign(st, await ah.status()); } catch (e) {} }
    let notifOk = false; const ln = LN();
    if (ln) { try { notifOk = (await ln.checkPermissions()).display === 'granted'; } catch (e) {} }
    return Object.assign(st, { notifOk, alertsOn: !!HT.state.settings.notify, native: !!ah });
  }
  async function fix(what) {
    const ah = AH();
    if (what === 'notif') { await ensurePerm(); return; }
    if (!ah) return;
    try { if (what === 'battery') await ah.openBattery(); else if (what === 'exact') await ah.openExactAlarms(); else await ah.openAppSettings(); } catch (e) { HT.toast('Could not open settings'); }
  }
  async function test() {
    const ln = LN(); if (!ln) { HT.toast('Notifications work in the Android app'); return; }
    if (!(await ensurePerm())) { HT.toast('Notifications are blocked for HomeTrack'); return; }
    try { await ln.schedule({ notifications: [{ id: 99, title: 'HomeTrack test ✓', body: 'Alerts can reach you. Lock the phone next time to check they still arrive.', schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true }, smallIcon: 'ic_launcher' }] }); HT.toast('Test arrives in ~10 s — lock the phone now'); }
    catch (e) { HT.toast('Could not schedule: ' + (e.message || 'error')); }
  }

  HT.notify = { available, requestPerm, sync, _sync: doSync, health, fix, test };

  if (native()) {
    setTimeout(doSync, 2500);
    HT.onResume(sync);
  }
})(window.HT);
