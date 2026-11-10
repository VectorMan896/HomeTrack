/* ============================================================
   HomeTrack bridge — local server for the phone app.
   - Galleries: ComfyUI + Fooocus outputs (separate sources) with
     per-image prompt metadata (.txt sibling or PNG text chunks).
   - Proxies Ollama (chat) and ComfyUI (image generation).
   Optional dependency: jimp (thumbnails). Run: node server.js
   Env: PORT, COMFY_DIR, FOOOCUS_DIR, OLLAMA, COMFYUI, ALLOW_ORIGINS
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '8790', 10);
const OLLAMA = (process.env.OLLAMA || 'http://127.0.0.1:11434').replace(/\/$/, '');
const COMFYUI = (process.env.COMFYUI || 'http://127.0.0.1:8188').replace(/\/$/, '');

const SOURCES = {
  comfy: { label: 'ComfyUI', dir: path.resolve(process.env.COMFY_DIR || 'C:/Users/Vector/AppData/Local/Comfy-Desktop/ComfyUI-Shared/output') },
  fooocus: { label: 'Fooocus', dir: path.resolve(process.env.FOOOCUS_DIR || 'C:/Users/Vector/Pictures/outputs') }
};

let Jimp = null; try { Jimp = require('jimp'); } catch (e) { console.log('(jimp not installed — thumbnails will fall back to full images; run "npm install" in bridge/)'); }
const THUMBDIR = path.join(__dirname, '.thumbcache');
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }

const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const VID = new Set(['.mp4', '.webm', '.mov', '.mkv']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };

// Who may call the bridge from a browser. The phone app sends its requests natively
// (CapacitorHttp → no Origin header), so this only matters for web pages: without it,
// any website open on this PC could read your gallery and drive Ollama/ComfyUI.
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
function originAllowed(origin) {
  if (!origin) return true;                                        // native app, curl, plain <img> loads
  if (ALLOW_ORIGINS.includes(origin)) return true;
  return /^(https?|capacitor):\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);   // app WebView + local dev
}
// DNS-rebinding guard: a hostile site can point its own domain at this PC so the browser treats
// it as same-origin. Only answer for IPs, localhost, bare machine names and Tailscale names.
function hostAllowed(host) {
  const h = String(host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!h) return true;
  return h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.') || h.endsWith('.ts.net');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', res._origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function json(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
const srcDir = (k) => (SOURCES[k] && SOURCES[k].dir) || null;

function walk(dir, base, out, depth) {
  if (depth > 6) return;
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(full, rel, out, depth + 1);
    else {
      const ext = path.extname(e.name).toLowerCase();
      const type = IMG.has(ext) ? 'image' : (VID.has(ext) ? 'video' : null);
      if (!type) continue;
      let st; try { st = fs.statSync(full); } catch (e2) { continue; }
      out.push({ p: rel, type, mtime: st.mtimeMs, size: st.size });
    }
  }
}

function safeFull(dir, rel) {
  const full = path.resolve(dir, '.' + path.sep + String(rel || ''));
  const r = path.relative(dir, full);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? full : null;   // must stay inside dir
}

function serveFile(res, dir, rel) {
  const full = safeFull(dir, rel);
  if (!full) { json(res, 403, { error: 'forbidden' }); return; }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { json(res, 404, { error: 'not found' }); return; }
    cors(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(full).pipe(res);
  });
}

// Read prompt metadata: sibling .txt, else PNG text chunks (tEXt/iTXt/zTXt).
function readMeta(full) {
  const txt = full.replace(/\.[^.]+$/, '') + '.txt';
  try { if (fs.existsSync(txt)) return fs.readFileSync(txt, 'utf8'); } catch (e) {}
  if (path.extname(full).toLowerCase() === '.png') { try { return readPngText(full); } catch (e) {} }
  return '';
}
function readPngText(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return '';
  let off = 8; const parts = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'tEXt') { const i = data.indexOf(0); parts.push(data.toString('latin1', 0, i) + ': ' + data.toString('latin1', i + 1)); }
    else if (type === 'iTXt') {
      const i = data.indexOf(0); const key = data.toString('utf8', 0, i);
      const comp = data[i + 1]; let p = i + 3; const l1 = data.indexOf(0, p); p = l1 + 1; const l2 = data.indexOf(0, p); p = l2 + 1;
      let text = data.slice(p); text = comp ? zlib.inflateSync(text).toString('utf8') : text.toString('utf8');
      parts.push(key + ': ' + text);
    } else if (type === 'zTXt') { const i = data.indexOf(0); try { parts.push(data.toString('latin1', 0, i) + ': ' + zlib.inflateSync(data.slice(i + 2)).toString('utf8')); } catch (e) {} }
    else if (type === 'IDAT' || type === 'IEND') break;
    off += 12 + len;
  }
  return parts.join('\n\n');
}

function proxy(target, req, res, subpath) {
  const t = new URL(target + subpath);
  const opts = { hostname: t.hostname, port: t.port || 80, path: t.pathname + t.search, method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/json' } };
  const pr = http.request(opts, (pres) => { cors(res); res.writeHead(pres.statusCode || 502, { 'Content-Type': pres.headers['content-type'] || 'application/json' }); pres.pipe(res); });
  pr.on('error', (e) => json(res, 502, { error: 'upstream unreachable: ' + e.message }));
  req.pipe(pr);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const origin = req.headers.origin;
  if (!hostAllowed(req.headers.host) || !originAllowed(origin)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end('{"error":"forbidden origin"}'); return; }
  res._origin = origin || null;
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  if (p === '/health') return json(res, 200, { ok: true, sources: Object.keys(SOURCES), ollama: OLLAMA, comfyui: COMFYUI });

  if (p === '/gallery/sources') {
    return json(res, 200, {
      sources: Object.keys(SOURCES).map(k => {
        const out = []; walk(SOURCES[k].dir, '', out, 0);
        return { key: k, label: SOURCES[k].label, count: out.length };
      })
    });
  }
  if (p === '/gallery/list' || p === '/comfy/list') {
    const src = u.searchParams.get('src') || 'comfy'; const dir = srcDir(src);
    if (!dir) return json(res, 404, { error: 'unknown source' });
    const out = []; walk(dir, '', out, 0); out.sort((a, b) => b.mtime - a.mtime);
    return json(res, 200, { count: out.length, items: out.slice(0, 600) });
  }
  if (p === '/gallery/file' || p === '/comfy/file') {
    const src = u.searchParams.get('src') || 'comfy'; const dir = srcDir(src);
    if (!dir) return json(res, 404, { error: 'unknown source' });
    return serveFile(res, dir, u.searchParams.get('p') || '');
  }
  if (p === '/gallery/thumb') {
    const src = u.searchParams.get('src') || 'comfy'; const dir = srcDir(src);
    const rel = u.searchParams.get('p') || ''; const w = Math.max(80, Math.min(800, parseInt(u.searchParams.get('w') || '400', 10)));
    const full = dir && safeFull(dir, rel);
    if (!full) return json(res, 404, { error: 'not found' });
    const ext = path.extname(full).toLowerCase();
    if (!Jimp || !IMG.has(ext)) return serveFile(res, dir, rel); // no thumb tool, or a video → serve original
    const cacheFull = path.join(THUMBDIR, hashStr(src + '|' + rel + '|' + w) + '.jpg');
    fs.stat(full, (e, sst) => {
      if (e) return json(res, 404, { error: 'not found' });
      fs.stat(cacheFull, async (ce, cst) => {
        if (!ce && cst.mtimeMs >= sst.mtimeMs) { cors(res); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' }); return fs.createReadStream(cacheFull).pipe(res); }
        try {
          const img = await Jimp.read(full);
          img.resize(w, Jimp.AUTO); img.quality(72);
          const buf = await img.getBufferAsync(Jimp.MIME_JPEG);
          try { fs.mkdirSync(THUMBDIR, { recursive: true }); fs.writeFileSync(cacheFull, buf); } catch (err) {}
          cors(res); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' }); res.end(buf);
        } catch (err) { serveFile(res, dir, rel); }
      });
    });
    return;
  }
  if (p === '/gallery/meta') {
    const src = u.searchParams.get('src') || 'comfy'; const dir = srcDir(src);
    const full = dir && safeFull(dir, u.searchParams.get('p') || '');
    if (!full) return json(res, 404, { error: 'not found' });
    return json(res, 200, { text: readMeta(full) });
  }

  if (p === '/workflow') {
    try { return json(res, 200, JSON.parse(fs.readFileSync(path.join(__dirname, 'workflow.json'), 'utf8'))); }
    catch (e) { return json(res, 404, { error: 'workflow.json not found in bridge/ — save your ComfyUI workflow (API format) there.' }); }
  }

  if (p === '/ollama' || p.startsWith('/ollama/')) return proxy(OLLAMA, req, res, p.replace(/^\/ollama/, '') || '/');
  if (p === '/comfyui' || p.startsWith('/comfyui/')) return proxy(COMFYUI, req, res, p.replace(/^\/comfyui/, '') || '/');

  json(res, 404, { error: 'not found', try: ['/health', '/gallery/sources', '/gallery/list?src=comfy', '/gallery/meta?src=comfy&p=', '/ollama/api/tags', '/comfyui/system_stats'] });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('HomeTrack bridge on http://localhost:' + PORT);
  Object.keys(SOURCES).forEach(k => console.log('  ' + SOURCES[k].label + ': ' + SOURCES[k].dir));
  console.log('  Ollama:  ' + OLLAMA + '  (/ollama)');
  console.log('  ComfyUI: ' + COMFYUI + '  (/comfyui)');
});
