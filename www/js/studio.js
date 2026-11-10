/* ============================================================
   HomeTrack — Studio (hidden, admin-only)
   ComfyUI gallery · Ollama chat · PixelAnvil, via the PC bridge.
   ============================================================ */
(function (HT) {
  const ADMIN_EMAIL = 'marlonferrerdaniel@gmail.com';
  const ST = () => HT.state.settings.studio || (HT.state.settings.studio = { showHidden: false, host: '' });
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  function isAdmin() { const u = HT.sync && HT.sync.currentUser && HT.sync.currentUser(); return !!(u && u.email && String(u.email).toLowerCase() === ADMIN_EMAIL); }
  function baseUrl(port) { let h = String(ST().host || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''); return h ? 'http://' + h + ':' + port : ''; }
  const bridge = () => baseUrl(8790);
  const pixel = () => baseUrl(8000);
  HT.studio = { isAdmin, ST, bridge, pixel, ADMIN_EMAIL, visible: () => isAdmin() && ST().showHidden !== false && !!String(ST().host || '').trim() };

  let sub = 'gallery';
  // Image cache: in-memory for the session + persistent on disk (Filesystem) so images
  // survive app restarts. Web relies on the browser's own HTTP cache. Videos aren't disk-cached.
  const memCache = {};
  const b64of = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function mimeFor(url) { if (/\/gallery\/thumb/.test(url)) return 'image/jpeg'; const e = ((url.split('?')[0].match(/\.(\w+)$/) || [])[1] || '').toLowerCase(); return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[e] || 'image/jpeg'; }
  async function imgSrc(el, url) {
    if (memCache[url]) { el.src = memCache[url]; return; }
    if (!native()) { el.src = url; return; }
    const FS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    const isVideo = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url);
    if (FS && !isVideo) {
      const key = 'htimg/' + hashStr(url) + '.b64', mime = mimeFor(url);
      try { const r = await FS.readFile({ path: key, directory: 'CACHE' }); const d = 'data:' + mime + ';base64,' + r.data; memCache[url] = d; el.src = d; return; } catch (e) {}
      try {
        const blob = await fetch(url).then(r => r.blob());
        const b64 = await b64of(blob);
        try { await FS.writeFile({ path: key, data: b64, directory: 'CACHE', recursive: true }); } catch (e) {}
        const d = 'data:' + mime + ';base64,' + b64; memCache[url] = d; el.src = d; return;
      } catch (e) { el.src = url; return; }
    }
    try { const b = await fetch(url).then(r => r.blob()); const o = URL.createObjectURL(b); memCache[url] = o; el.src = o; }
    catch (e) { el.src = url; }
  }

  function render(el) {
    el.innerHTML = `<div class="segmented" id="studioSub">
        <button type="button" class="seg ${sub === 'gallery' ? 'active' : ''}" data-sub="gallery">🖼 Gallery</button>
        <button type="button" class="seg ${sub === 'chat' ? 'active' : ''}" data-sub="chat">💬 Chat</button>
        <button type="button" class="seg ${sub === 'pixel' ? 'active' : ''}" data-sub="pixel">🎨 PixelAnvil</button>
      </div><div id="studioBody" style="margin-top:14px"></div>`;
    HT.$$('#studioSub .seg', el).forEach(x => x.addEventListener('click', () => { sub = x.dataset.sub; render(el); }));
    const body = HT.$('#studioBody', el);
    if (!bridge()) { body.innerHTML = `<div class="card"><p class="hint">Set your PC address in <b>Settings → Studio</b>, and start the bridge server on your PC (see <code>bridge/</code>).</p></div>`; return; }
    if (sub === 'gallery') renderGallery(body);
    else if (sub === 'chat') renderChat(body);
    else renderPixel(body);
  }

  /* ---- Gallery ---- */
  let gallery = { items: [], shown: 0, src: 'comfy', sources: null };
  async function renderGallery(body) {
    if (!gallery.sources) {
      try { const r = await fetch(bridge() + '/gallery/sources'); gallery.sources = (await r.json()).sources || []; }
      catch (e) { gallery.sources = [{ key: 'comfy', label: 'ComfyUI' }, { key: 'fooocus', label: 'Fooocus' }]; }
    }
    const tabs = gallery.sources.map(sc => `<button type="button" class="seg ${sc.key === gallery.src ? 'active' : ''}" data-gsrc="${sc.key}">${HT.escapeHtml(sc.label)}${sc.count != null ? ` (${sc.count})` : ''}</button>`).join('');
    body.innerHTML = `<div class="segmented" style="margin-bottom:12px">${tabs}</div><div class="card"><div class="card-head"><h2>Gallery</h2><button class="btn btn-sm" id="galRefresh">↻</button></div><div id="galGrid" class="gal-grid"></div><div id="galMore"></div><p class="hint" id="galHint" style="margin-top:8px">Loading…</p></div>`;
    HT.$$('[data-gsrc]', body).forEach(b => b.addEventListener('click', () => { gallery.src = b.dataset.gsrc; gallery.items = []; renderGallery(body); }));
    HT.$('#galRefresh', body).addEventListener('click', () => loadGallery(body));
    if (gallery.items.length) { gallery.shown = 0; HT.$('#galGrid', body).innerHTML = ''; paintGallery(body); } else loadGallery(body);
  }
  async function loadGallery(body) {
    const hint = HT.$('#galHint', body); if (hint) hint.textContent = 'Loading…';
    const grid = HT.$('#galGrid', body); if (grid) grid.innerHTML = '';
    try {
      const r = await fetch(bridge() + '/gallery/list?src=' + gallery.src); const d = await r.json();
      gallery.items = d.items || []; gallery.shown = 0; paintGallery(body);
    } catch (e) { if (hint) hint.textContent = 'Could not reach the bridge. Is the server running and the PC address correct?'; }
  }
  const fileUrl = (p) => bridge() + '/gallery/file?src=' + gallery.src + '&p=' + encodeURIComponent(p);
  const thumbUrl = (p) => bridge() + '/gallery/thumb?src=' + gallery.src + '&w=400&p=' + encodeURIComponent(p);
  function paintGallery(body) {
    const grid = HT.$('#galGrid', body); if (!grid) return;
    gallery.items.slice(gallery.shown, gallery.shown + 30).forEach(it => {
      const cell = document.createElement('div'); cell.className = 'gal-cell';
      if (it.type === 'video') cell.innerHTML = '<div class="gal-vid">▶</div>';
      else { const img = document.createElement('img'); img.loading = 'lazy'; imgSrc(img, thumbUrl(it.p)); cell.appendChild(img); }
      cell.addEventListener('click', () => openFull(it));
      grid.appendChild(cell);
    });
    gallery.shown = Math.min(gallery.shown + 30, gallery.items.length);
    const more = HT.$('#galMore', body);
    more.innerHTML = gallery.shown < gallery.items.length ? `<button class="btn" id="galMoreBtn" style="margin-top:12px;width:100%">Load more (${gallery.items.length - gallery.shown} left)</button>` : '';
    const mb = HT.$('#galMoreBtn', body); if (mb) mb.addEventListener('click', () => paintGallery(body));
    const hint = HT.$('#galHint', body); if (hint) hint.textContent = `${gallery.items.length} items · newest first`;
  }
  function openFull(it) {
    const url = fileUrl(it.p);
    const fname = it.p.split('/').pop();
    const isVid = it.type === 'video';
    const media = isVid
      ? `<video id="fullMedia" controls autoplay loop playsinline style="max-width:100%;border-radius:12px"></video>`
      : `<img id="fullMedia" style="max-width:100%;border-radius:12px" />`;
    HT.openModal(fname, `<div style="text-align:center">${media}</div>
      <div class="gal-actions"><button class="btn btn-sm" data-act="save">⬇ Save</button><button class="btn btn-sm" data-act="share">↗ Share</button></div>
      <div id="galMeta" class="gal-meta">Loading prompt…</div>`, (root) => {
      imgSrc(root.querySelector('#fullMedia'), url); // blob-loads video too, so it plays on the phone
      root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => mediaAction(url, fname, b.dataset.act)));
      fetch(bridge() + '/gallery/meta?src=' + gallery.src + '&p=' + encodeURIComponent(it.p)).then(r => r.json())
        .then(d => { const el = root.querySelector('#galMeta'); if (el) el.textContent = (d.text || '').trim() || 'No prompt metadata for this image.'; })
        .catch(() => { const el = root.querySelector('#galMeta'); if (el) el.textContent = '(metadata unavailable)'; });
    });
  }
  async function mediaAction(url, filename, mode) {
    const cap = window.Capacitor, isNative = cap && cap.isNativePlatform && cap.isNativePlatform();
    if (isNative) {
      const FS = cap.Plugins.Filesystem, Sh = cap.Plugins.Share;
      try {
        HT.toast('Preparing…');
        const blob = await fetch(url).then(r => r.blob());
        const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
        const w = await FS.writeFile({ path: filename, data: b64, directory: 'CACHE' });
        if (Sh && w && w.uri) await Sh.share({ title: filename, url: w.uri, dialogTitle: (mode === 'save' ? 'Save' : 'Share') + ' image' });
        else HT.toast('Saved to app storage');
      } catch (e) { HT.toast('Failed: ' + (e.message || 'error')); }
    } else {
      if (mode === 'share' && navigator.share) {
        try { const blob = await fetch(url).then(r => r.blob()); const file = new File([blob], filename, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) {}
      }
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
  }

  /* ---- Chat (Ollama) ---- */
  let chat = { model: '', messages: [], models: [] };
  async function renderChat(body) {
    body.innerHTML = `<div class="card">
      <div class="card-head"><h2>Chat</h2><div class="model-pick"><button type="button" class="model-btn" id="modelBtn">model ▾</button><div class="model-menu hidden" id="modelMenu"></div></div></div>
      <div id="chatLog" class="chat-log"></div>
      <form id="chatForm" style="margin-top:12px"><div class="row" style="gap:8px"><label class="field" style="flex:1"><input id="chatInput" placeholder="Message your model…" autocomplete="off"></label><button class="btn btn-primary" type="submit" style="align-self:flex-end;height:46px">Send</button></div></form>
      <p class="hint" id="chatHint" style="margin-top:6px"></p></div>`;
    paintChat(body);
    const btn = HT.$('#modelBtn', body), menu = HT.$('#modelMenu', body);
    const drawMenu = () => { menu.innerHTML = chat.models.length ? chat.models.map(m => `<button type="button" class="model-opt ${m === chat.model ? 'active' : ''}" data-m="${HT.escapeHtml(m)}">${HT.escapeHtml(m)}</button>`).join('') : '<div class="hint" style="padding:10px">no models</div>'; };
    const setBtn = () => { btn.textContent = (chat.model || 'model') + ' ▾'; };
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    menu.addEventListener('click', (e) => { const o = e.target.closest('[data-m]'); if (o) { chat.model = o.dataset.m; setBtn(); drawMenu(); menu.classList.add('hidden'); } });
    try {
      const r = await fetch(bridge() + '/ollama/api/tags'); const d = await r.json();
      chat.models = (d.models || []).map(m => m.name);
      if (!chat.model && chat.models.length) chat.model = chat.models[0];
      drawMenu(); setBtn();
    } catch (e) { chat.models = []; btn.textContent = 'offline'; HT.$('#chatHint', body).textContent = 'Ollama not reachable via the bridge.'; }
    HT.$('#chatForm', body).addEventListener('submit', (e) => { e.preventDefault(); sendChat(body); });
  }
  // Minimal, safe markdown (operates on already-escaped text): code, bold, italic, headings, bullets.
  function md(esc) {
    const parts = esc.split('```');
    let out = '';
    parts.forEach((part, idx) => {
      if (idx % 2 === 1) { out += `<pre class="md-pre">${part.replace(/^\n/, '')}</pre>`; return; }
      out += part
        .replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
        .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '<b>$1</b>')
        .replace(/^\s*[-*]\s+(.*)$/gm, '• $1')
        .replace(/\n/g, '<br>');
    });
    return out;
  }
  function paintChat(body) {
    const log = HT.$('#chatLog', body); if (!log) return;
    log.innerHTML = chat.messages.length ? chat.messages.map(m => `<div class="chat-msg ${m.role}"><div class="bubble">${m.role === 'assistant' ? md(HT.escapeHtml(m.content)) : HT.escapeHtml(m.content).replace(/\n/g, '<br>')}</div></div>`).join('') : '<p class="hint" style="text-align:center;padding:20px 0">Ask your local model anything.</p>';
    log.scrollTop = log.scrollHeight;
  }
  async function sendChat(body) {
    const inp = HT.$('#chatInput', body); const text = inp.value.trim(); if (!text || !chat.model) return;
    chat.messages.push({ role: 'user', content: text }); inp.value = '';
    chat.messages.push({ role: 'assistant', content: '…' }); paintChat(body);
    try {
      const r = await fetch(bridge() + '/ollama/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: chat.model, messages: chat.messages.filter(m => m.content !== '…'), stream: false }) });
      const d = await r.json();
      chat.messages[chat.messages.length - 1] = { role: 'assistant', content: (d.message && d.message.content) || d.error || '(no response)' };
    } catch (e) { chat.messages[chat.messages.length - 1] = { role: 'assistant', content: 'Error reaching Ollama via the bridge.' }; }
    paintChat(body);
  }

  /* ---- PixelAnvil — in-app image generation via ComfyUI ---- */
  let lastPrompt = '';
  // SDXL-friendly dimensions (~1MP) per aspect ratio
  const ASPECTS = { '1:1': [1024, 1024], '3:4': [896, 1152], '2:3': [832, 1216], '9:16': [768, 1344], '4:3': [1152, 896], '3:2': [1216, 832], '16:9': [1344, 768] };
  function buildWorkflow(wf, prompt) {
    const gs = HT.state.settings.gen || {};
    const dims = ASPECTS[gs.aspect];
    let key = null;
    for (const k in wf) { const n = wf[k]; if (n.class_type === 'PrimitiveStringMultiline') { key = k; if (n._meta && /positive/i.test(n._meta.title || '')) break; } }
    if (key && wf[key].inputs && 'value' in wf[key].inputs) wf[key].inputs.value = prompt;
    for (const k in wf) {
      const n = wf[k]; if (!n.inputs) continue;
      if (/KSampler/i.test(n.class_type)) { if ('seed' in n.inputs) n.inputs.seed = Math.floor(Math.random() * 1e15); if (gs.steps) n.inputs.steps = Math.max(1, Math.min(80, +gs.steps)); }
      if (n.class_type === 'EmptyLatentImage') { if (dims) { n.inputs.width = dims[0]; n.inputs.height = dims[1]; } if (gs.batch) n.inputs.batch_size = Math.max(1, Math.min(8, +gs.batch)); }
      if (n.class_type === 'CheckpointLoaderSimple' && gs.model) n.inputs.ckpt_name = gs.model;
    }
    return !!key;
  }
  async function loadModels(sel) {
    if (!sel) return;
    try {
      const info = await fetch(bridge() + '/comfyui/object_info/CheckpointLoaderSimple').then(r => r.json());
      const list = info && info.CheckpointLoaderSimple && info.CheckpointLoaderSimple.input && info.CheckpointLoaderSimple.input.required && info.CheckpointLoaderSimple.input.required.ckpt_name && info.CheckpointLoaderSimple.input.required.ckpt_name[0];
      if (Array.isArray(list)) { const cur = (HT.state.settings.gen || {}).model; sel.innerHTML = '<option value="">(workflow default)</option>' + list.map(m => `<option ${m === cur ? 'selected' : ''}>${HT.escapeHtml(m)}</option>`).join(''); }
    } catch (e) {}
  }
  // Illustrious = Danbooru-tag trained → build comma-separated booru tags, not sentences.
  function randomPrompt() {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const subj = pick(['1girl, solo', '1boy, solo', '1girl', '2girls', 'cat girl, animal ears', 'elf, pointy ears', 'knight', 'witch', 'samurai', 'android girl', 'fox girl, animal ears', 'mermaid']);
    const hair = pick(['long hair', 'short hair', 'twintails', 'ponytail', 'silver hair', 'blue hair', 'pink hair, messy hair', 'black hair', 'blonde hair', 'braid']);
    const eyes = pick(['blue eyes', 'red eyes', 'green eyes', 'heterochromia', 'glowing eyes', 'purple eyes', 'golden eyes']);
    const cloth = pick(['school uniform', 'kimono', 'ornate armor', 'gothic lolita dress', 'hoodie', 'elegant dress', 'cyberpunk outfit', 'witch hat, robe', 'cloak', 'sailor uniform']);
    const pose = pick(['looking at viewer', 'smiling', 'from side', 'dynamic pose', 'sitting', 'standing, arms crossed', 'from above', 'wind lift, floating hair', 'holding sword']);
    const setting = pick(['cherry blossoms', 'neon city at night', 'deep forest', 'beach, sunset', 'rooftop, city lights', 'rain, umbrella', 'starry sky', 'ancient ruins', 'cozy cafe interior', 'snowy street']);
    const style = pick(['cinematic lighting', 'soft lighting', 'vibrant colors', 'depth of field, bokeh', 'dramatic lighting', 'pastel colors', 'god rays']);
    return `masterpiece, best quality, highly detailed, ${subj}, ${hair}, ${eyes}, ${cloth}, ${pose}, ${setting}, ${style}`;
  }
  // Tasteful "glamour / pinup" randomizer — adult-anchored, suggestive not explicit.
  function spicyPrompt() {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const subj = pick(['1girl, solo, mature female', '1girl, solo, adult, curvy', '1girl, solo, mature female, tall', '1boy, solo, adult, muscular']);
    const hair = pick(['long wavy hair', 'silver hair', 'black hair, long hair', 'red hair', 'ponytail', 'messy bun']);
    const eyes = pick(['half-closed eyes', 'blue eyes', 'red eyes', 'green eyes', 'purple eyes']);
    const attire = pick(['bikini', 'one-piece swimsuit', 'elegant lingerie', 'evening gown', 'off-shoulder dress', 'bodycon dress', 'silk robe', 'cocktail dress', 'crop top, high-waisted skirt']);
    const pose = pick(['sultry expression', 'confident pose, hand on hip', 'looking over shoulder', 'seductive smile', 'leaning forward', 'lounging elegantly', 'flirtatious pose', 'elegant pose, crossed legs']);
    const setting = pick(['boudoir, candlelight', 'luxury bedroom, dim lighting', 'poolside at sunset', 'neon-lit lounge', 'rose petals, soft lighting', 'moonlit balcony', 'sauna, steam']);
    const style = pick(['glamour lighting', 'cinematic lighting', 'soft focus, bokeh', 'warm ambient lighting', 'dramatic rim light', 'sensual atmosphere']);
    return `masterpiece, best quality, highly detailed, ${subj}, ${hair}, ${eyes}, ${attire}, ${pose}, ${setting}, ${style}`;
  }
  async function improvePrompt(text) {
    try {
      let model = chat.model;
      if (!model) { const d = await fetch(bridge() + '/ollama/api/tags').then(r => r.json()); model = d.models && d.models[0] && d.models[0].name; }
      if (!model) return null;
      const sys = 'You are a prompt engineer for the Illustrious anime image model, which is trained on Danbooru (booru) tags. Convert the idea into a single line of comma-separated booru tags covering character traits, hair, eyes, clothing, pose, expression, setting, and art style, plus quality tags like masterpiece, best quality, highly detailed. Output ONLY the tags, comma-separated on one line. No sentences, no explanations, no quotes, no headings.';
      const r = await fetch(bridge() + '/ollama/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }] }) }).then(r => r.json());
      let out = ((r.message && r.message.content) || '').trim();
      out = out.replace(/^["'`]+|["'`]+$/g, '').replace(/\s*\n+\s*/g, ', ').replace(/,\s*,/g, ',').trim();
      return out || null;
    } catch (e) { return null; }
  }

  let gen = { running: false, submitted: 0, startedAt: 0, timer: null };
  function renderPixel(body) {
    const gs = HT.state.settings.gen || (HT.state.settings.gen = { aspect: '2:3', model: '', steps: 20, batch: 2 });
    body.innerHTML = `<div class="card">
      <div class="card-head"><h2>PixelAnvil · Generate</h2></div>
      <textarea id="genPrompt" class="gen-prompt" rows="4" placeholder="booru tags, comma-separated — e.g. 1girl, silver hair, kimono, cherry blossoms, masterpiece">${HT.escapeHtml(lastPrompt)}</textarea>
      <div class="prompt-tools"><button class="btn btn-sm" id="genRandom">🎲 Random</button><button class="btn btn-sm" id="genSpicy">🔥</button><button class="btn btn-sm" id="genImprove">✨ Improve</button></div>
      <details class="gen-settings"><summary>⚙ Settings</summary>
        <div class="row" style="margin-top:10px">
          <label class="field"><span>Aspect ratio</span><select id="genAspect">${Object.keys(ASPECTS).map(a => `<option ${gs.aspect === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
          <label class="field"><span>Batch size</span><input type="number" id="genBatch" min="1" max="8" value="${gs.batch || 2}"></label>
        </div>
        <div class="row">
          <label class="field"><span>Steps</span><input type="number" id="genSteps" min="1" max="60" value="${gs.steps || 20}"></label>
          <label class="field"><span>Model</span><select id="genModel"><option value="">(workflow default)</option></select></label>
        </div>
      </details>
      <button class="btn btn-primary" id="genBtn" style="margin-top:10px">✨ Generate</button>
      <div id="genProg" class="gen-prog${gen.running ? '' : ' hidden'}"><div class="gen-bar"><i></i></div></div>
      <p class="hint" id="genStatus" style="margin-top:8px">Runs your ComfyUI workflow — just prompt. Needs ComfyUI running. Tip: tap Generate again to queue more.</p>
      <div id="genResults" class="gal-grid" style="margin-top:12px"></div></div>`;
    const promptEl = HT.$('#genPrompt', body), btn = HT.$('#genBtn', body), status = HT.$('#genStatus', body);
    HT.$('#genRandom', body).addEventListener('click', () => { promptEl.value = randomPrompt(); lastPrompt = promptEl.value; });
    HT.$('#genSpicy', body).addEventListener('click', () => { promptEl.value = spicyPrompt(); lastPrompt = promptEl.value; });
    // settings
    const aspectEl = HT.$('#genAspect', body), batchEl = HT.$('#genBatch', body), stepsEl = HT.$('#genSteps', body), modelEl = HT.$('#genModel', body);
    aspectEl.addEventListener('change', () => { gs.aspect = aspectEl.value; HT.save(); });
    batchEl.addEventListener('change', () => { gs.batch = Math.max(1, Math.min(8, +batchEl.value || 2)); batchEl.value = gs.batch; HT.save(); });
    stepsEl.addEventListener('change', () => { gs.steps = Math.max(1, Math.min(80, +stepsEl.value || 20)); stepsEl.value = gs.steps; HT.save(); });
    modelEl.addEventListener('change', () => { gs.model = modelEl.value; HT.save(); });
    loadModels(modelEl);
    HT.$('#genImprove', body).addEventListener('click', async () => {
      const cur = promptEl.value.trim(); if (!cur) { HT.toast('Type an idea first'); return; }
      const ib = HT.$('#genImprove', body); ib.disabled = true; status.textContent = 'Improving prompt with your model…';
      const improved = await improvePrompt(cur);
      ib.disabled = false;
      if (improved) { promptEl.value = improved; lastPrompt = improved; status.textContent = 'Prompt improved into booru tags ✓'; }
      else status.textContent = 'Could not improve (is Ollama running with a model?)';
    });
    btn.addEventListener('click', async () => {
      const prompt = promptEl.value.trim(); if (!prompt) return;
      lastPrompt = prompt; status.textContent = 'Queuing…';
      try {
        const wf = await fetch(bridge() + '/workflow').then(r => r.json());
        if (wf.error) { status.textContent = wf.error; return; }
        buildWorkflow(wf, prompt);
        const q = await fetch(bridge() + '/comfyui/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'hometrack' }) }).then(r => r.json());
        if (!q || !q.prompt_id) { status.textContent = 'ComfyUI rejected the prompt (is it running?).'; return; }
        gen.submitted++; HT.toast('Queued'); startMonitor();
      } catch (e) { status.textContent = 'Failed: ' + (e.message || 'error'); }
    });
  }
  function startMonitor() {
    const pg = HT.$('#genProg'); if (pg) pg.classList.remove('hidden');
    if (gen.running) return;
    gen.running = true; gen.startedAt = Date.now();
    gen.timer = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - gen.startedAt) / 1000);
      let total = 0, known = false;
      try { const qd = await fetch(bridge() + '/comfyui/queue').then(r => r.json()); total = (qd.queue_running || []).length + (qd.queue_pending || []).length; known = true; } catch (e) {}
      const st = document.getElementById('genStatus');
      if (st) st.textContent = `Rendering… ${elapsed}s${total ? ' · ' + total + ' in queue' : ''}`;
      if (known && total === 0 && elapsed > 3) {
        clearInterval(gen.timer); gen.running = false; const made = gen.submitted; gen.submitted = 0;
        const prog = document.getElementById('genProg'); if (prog) prog.classList.add('hidden');
        if (st) st.textContent = `Done ✓ (${elapsed}s)`;
        try {
          const list = await fetch(bridge() + '/gallery/list?src=comfy').then(r => r.json());
          const rs = document.getElementById('genResults');
          if (rs) { rs.innerHTML = ''; (list.items || []).slice(0, Math.min(12, Math.max(4, made * 2))).forEach(it => { const cell = document.createElement('div'); cell.className = 'gal-cell'; const img = document.createElement('img'); img.loading = 'lazy'; imgSrc(img, bridge() + '/gallery/thumb?src=comfy&w=400&p=' + encodeURIComponent(it.p)); cell.appendChild(img); cell.addEventListener('click', () => { gallery.src = 'comfy'; openFull(it); }); rs.appendChild(cell); }); }
        } catch (e) {}
      }
    }, 1600);
  }

  HT.register('studio', { title: 'Studio', mark: '✨', sub: 'Studio', render, init: () => {}, quickAdd: () => HT.modules.overview.quickAdd(), alert: () => null, reconcile: () => {} });
})(window.HT);
