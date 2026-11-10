/* ============================================================
   HomeTrack — cloud sync (Supabase Auth + Postgres)
   Per-user cloud backup layered on the offline-first localStorage
   state. NO-OP until config.js has a Supabase url + anon key.

   Model: localStorage is the working copy. On sign-in we compare
   with the cloud row: whichever side changed since the last sync
   wins; if both did, you're asked which to keep. After that every
   real local change is pushed (debounced).
   ============================================================ */
(function (HT) {
  const CFG = window.HT_SUPABASE_CONFIG;
  const configured = !!(CFG && CFG.url && CFG.anonKey);

  let client = null, user = null, pushTimer = null;
  const origSave = HT.save;

  function available() { return configured; }
  function enabled() { return !!user; }
  function currentUser() { return user ? { uid: user.id, email: user.email, name: (user.user_metadata && user.user_metadata.name) } : null; }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  }
  async function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return window.supabase;
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
    return window.supabase;
  }

  async function init() {
    if (!configured) return;
    try {
      const sb = await loadSupabase();
      client = sb.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      HT.save = function () { origSave.call(HT); schedulePush(); };
      const { data } = await client.auth.getSession();
      user = data && data.session ? data.session.user : null;
      if (user) await reconcile();
      client.auth.onAuthStateChange(async (_evt, session) => {
        const was = user && user.id;
        user = session ? session.user : null;
        if (user && user.id !== was) await reconcile();
        if (HT.refresh) HT.refresh();
      });
      if (HT.refresh) HT.refresh();
    } catch (e) { console.warn('sync init failed', e); }
  }

  // _updatedAt = last real local change (stamped by HT.save), _syncedAt = cloud version we last matched.
  const localAt = () => HT.state._updatedAt || 0;
  const syncedAt = () => HT.state._syncedAt || 0;
  const dirty = () => localAt() > syncedAt();

  function loadCloud(row) {
    HT.replaceState(row.data, true);
    HT.state._updatedAt = row.updated_at; HT.state._syncedAt = row.updated_at;
    HT.reconcileAll(); origSave.call(HT);
    HT.toast('Loaded your cloud data');
  }

  async function reconcile() {
    try {
      const { data, error } = await client.from('states').select('data, updated_at').eq('uid', user.id).maybeSingle();
      if (error) { console.warn(error); return; }
      if (!data || !data.data) { await push(true); return; }
      const cloudAt = data.updated_at || 0;
      const cloudChanged = cloudAt > syncedAt();
      if (cloudChanged && dirty()) {
        // Both sides changed since the last sync (e.g. edits made while signed out). Don't guess.
        const keepLocal = confirm("This device and your cloud account both have changes.\n\nOK = keep THIS DEVICE's data (uploads it)\nCancel = load the CLOUD data (replaces this device)");
        if (keepLocal) await push(true); else loadCloud(data);
      } else if (cloudChanged) loadCloud(data);
      else if (dirty()) await push(true);
    } catch (e) { console.warn('reconcile failed', e); }
  }

  function schedulePush() { if (!user || !dirty()) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => push(false), 1500); }

  async function push(immediate) {
    if (!user || !client) return;
    try {
      const at = localAt() || Date.now();
      const { error } = await client.from('states').upsert(
        { uid: user.id, data: HT.state, updated_at: at, email: user.email || null },
        { onConflict: 'uid' });
      if (error) { console.warn(error); if (immediate) HT.toast('Sync failed'); return; }
      if (!HT.state._updatedAt) HT.state._updatedAt = at;
      HT.state._syncedAt = at; origSave.call(HT);   // an edit made during the upload stays newer → pushed next
      if (immediate) HT.toast('Synced');
    } catch (e) { console.warn('push failed', e); if (immediate) HT.toast('Sync failed'); }
  }

  /* ---- auth UI ---- */
  function signIn() {
    if (!configured) return;
    let mode = 'in';
    const body = `
      <div class="segmented" id="authToggle"><button type="button" class="seg active" data-m="in">Sign in</button><button type="button" class="seg" data-m="up">Create account</button></div>
      <form class="form" id="authForm">
        <label class="field"><span>Email</span><input type="email" name="email" inputmode="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
        <p class="rate-preview" id="authMsg"></p>
        <button class="btn btn-primary" type="submit" id="authSubmit">Sign in</button>
      </form>`;
    HT.openModal('Account', body, (root) => {
      const f = HT.$('#authForm', root);
      HT.$$('#authToggle .seg', root).forEach(b => b.addEventListener('click', () => {
        mode = b.dataset.m;
        HT.$$('#authToggle .seg', root).forEach(x => x.classList.toggle('active', x === b));
        HT.$('#authSubmit', root).textContent = mode === 'up' ? 'Create account' : 'Sign in';
      }));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = f.email.value.trim(), pw = f.password.value;
        HT.$('#authMsg', root).textContent = 'Working…';
        try {
          const fn = mode === 'up'
            ? client.auth.signUp({ email, password: pw })
            : client.auth.signInWithPassword({ email, password: pw });
          const { data, error } = await fn;
          if (error) { HT.$('#authMsg', root).textContent = friendly(error); return; }
          if (mode === 'up' && data && !data.session) { HT.$('#authMsg', root).textContent = 'Account created — check your email to confirm, then sign in.'; return; }
          HT.closeModal();
        } catch (err) { HT.$('#authMsg', root).textContent = friendly(err); }
      });
    });
  }
  function signOut() { if (client) client.auth.signOut().then(() => { user = null; HT.toast('Signed out'); if (HT.refresh) HT.refresh(); }); }
  function friendly(err) {
    const m = ((err && err.message) || '').toLowerCase();
    if (m.includes('invalid login')) return 'Wrong email or password.';
    if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
    if (m.includes('password')) return 'Password should be at least 6 characters.';
    if (m.includes('email')) return 'Check the email address.';
    if (m.includes('network') || m.includes('fetch')) return 'Network error — check your connection.';
    return (err && err.message) || 'Something went wrong.';
  }

  HT.sync = { available, enabled, currentUser, signIn, signOut, push, init, reconcile: () => user && reconcile() };
  if (configured) init();
})(window.HT);
