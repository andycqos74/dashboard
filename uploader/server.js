/*
 * Logo upload proxy for the QoS Staff Dashboard.
 *
 * Combined Storage (github.com/andycqos74/combinedstorage) gates its whole
 * management API behind an admin session, but a browser cannot keep a secret —
 * shipping the admin password to every staff PC would hand them the entire file
 * manager. So this tiny service sits in the dashboard stack, holds the
 * credentials, and exposes exactly one unauthenticated operation to the LAN:
 *
 *   POST /upload?name=<filename>   raw image bytes  ->  { "url": "<public CDN url>" }
 *
 * It logs in on demand, keeps the session cookie, retries once on 401, and
 * returns the stable public /f/<token> URL, which needs no auth to read — so
 * every visitor sees the same logo.
 *
 * Deliberately dependency-free (node:http/https only) so the image needs no
 * npm install and nothing to audit beyond this file.
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const BASE = String(process.env.CS_BASE_URL || '').replace(/\/+$/, '');
const USER = process.env.CS_USERNAME || '';
const PASS = process.env.CS_PASSWORD || '';
const PARENT = process.env.CS_PARENT_ID || 'root';
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);
// Set CS_INSECURE_TLS=1 only for a self-signed certificate on a trusted LAN.
const INSECURE = process.env.CS_INSECURE_TLS === '1';

let cookie = null;

function agentFor(u) { return u.protocol === 'https:' ? https : http; }

function request(urlStr, opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = agentFor(u).request(
      u,
      { method: opts.method || 'GET', headers: opts.headers || {}, rejectUnauthorized: !INSECURE },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login() {
  const res = await request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ username: USER, password: PASS }));
  if (res.status !== 200) throw new Error(`Combined Storage login failed (${res.status})`);
  const set = res.headers['set-cookie'];
  if (!set || !set.length) throw new Error('Combined Storage login returned no session cookie');
  cookie = set.map((c) => c.split(';')[0]).join('; ');
}

// Combined Storage rejects a second file with the same name in a folder
// ("An item with that name already exists here."), and logo filenames repeat
// constantly — two tiles both uploading "logo.png", or the same image twice.
// The stored name is irrelevant to us (tiles reference the returned URL), so
// make every upload unique and keep the extension for a sensible mime type.
function uniqueName(original) {
  const safe = String(original || 'logo.png').replace(/[/\\]/g, '_').slice(-120);
  const dot = safe.lastIndexOf('.');
  const stem = (dot > 0 ? safe.slice(0, dot) : safe).slice(0, 48) || 'logo';
  const ext = dot > 0 ? safe.slice(dot) : '.png';
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${stem}-${stamp}${ext}`;
}

async function uploadOnce(name, type, buf) {
  return request(
    `${BASE}/api/files/${encodeURIComponent(PARENT)}/upload?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': type || 'application/octet-stream',
        'Content-Length': buf.length,
        Cookie: cookie || '',
      },
    },
    buf,
  );
}

async function upload(name, type, buf) {
  if (!cookie) await login();
  let res = await uploadOnce(name, type, buf);
  if (res.status === 401) {           // session expired or server restarted
    await login();
    res = await uploadOnce(name, type, buf);
  }
  if (res.status !== 201 && res.status !== 200) {
    let msg = `Upload rejected (${res.status})`;
    try { const j = JSON.parse(res.body); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  const dto = JSON.parse(res.body);
  if (!dto.url) throw new Error('Combined Storage returned no public URL for the file');
  return dto.url;
}

// ---- grab a representative image from a website -----------------------------
// Fetches the page and picks the best image it advertises about itself:
// og:image (the sharing preview, usually a real banner) > apple-touch-icon >
// favicon. Deliberately no headless browser: a full page render would add
// ~400MB of Chromium to this image and, for the login-gated tools on this
// dashboard, would only ever screenshot a login form.
function fetchBinary(urlStr, depth) {
  if ((depth || 0) > 4) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (_) { return reject(new Error('Invalid URL')); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('Only http(s) URLs are supported'));
    const req = agentFor(u).request(u, {
      method: 'GET',
      rejectUnauthorized: !INSECURE,
      headers: { 'User-Agent': 'QoS-Dashboard-LogoGrabber/1.0', Accept: '*/*' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBinary(new URL(res.headers.location, u).toString(), (depth || 0) + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Site returned ${res.statusCode}`)); }
      const chunks = []; let total = 0;
      res.on('data', (c) => {
        total += c.length;
        if (total > MAX_BYTES) { req.destroy(); return reject(new Error('Remote image is too large')); }
        chunks.push(c);
      });
      res.on('end', () => resolve({
        buf: Buffer.concat(chunks),
        type: String(res.headers['content-type'] || '').split(';')[0].trim(),
        finalUrl: u.toString(),
      }));
    });
    req.on('error', (e) => reject(new Error(e.message)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Site timed out')); });
    req.end();
  });
}

function pickImageFromHtml(html, pageUrl) {
  const head = html.slice(0, 200000);
  const candidates = [];
  const push = (v, rank) => { if (v) candidates.push({ v, rank }); };
  const meta = /<meta[^>]+>/gi;
  let m;
  while ((m = meta.exec(head))) {
    const tag = m[0];
    const prop = (/(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const content = (/content\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!prop || !content) continue;
    const p = prop.toLowerCase();
    if (p === 'og:image' || p === 'og:image:url') push(content, 0);
    else if (p === 'twitter:image' || p === 'twitter:image:src') push(content, 1);
  }
  const link = /<link[^>]+>/gi;
  while ((m = link.exec(head))) {
    const tag = m[0];
    const rel = ((/rel\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || '').toLowerCase();
    const href = (/href\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!href) continue;
    if (rel.includes('apple-touch-icon')) push(href, 2);
    else if (rel.split(/\s+/).includes('icon') || rel.includes('shortcut icon')) push(href, 3);
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const out = [];
  for (const c of candidates) {
    try { out.push(new URL(c.v, pageUrl).toString()); } catch (_) {}
  }
  try { out.push(new URL('/favicon.ico', pageUrl).toString()); } catch (_) {}
  return out.filter((v, i, a) => a.indexOf(v) === i);
}

async function grabSiteImage(pageUrl) {
  const page = await fetchBinary(pageUrl);
  // The URL might point straight at an image already.
  if (/^image\//.test(page.type)) return { buf: page.buf, type: page.type, from: page.finalUrl };
  const html = page.buf.toString('utf8');
  const candidates = pickImageFromHtml(html, page.finalUrl);
  if (!candidates.length) throw new Error('That page advertises no logo or preview image');
  let lastErr = null;
  for (const c of candidates) {
    try {
      const img = await fetchBinary(c);
      if (/^image\//.test(img.type) && img.buf.length) return { buf: img.buf, type: img.type, from: c };
      lastErr = new Error('Not an image');
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Could not fetch an image from that site${lastErr ? ` (${lastErr.message})` : ''}`);
}

function extFor(mime) {
  const map = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/svg+xml': '.svg',
    'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico',
  };
  return map[String(mime).toLowerCase()] || '.png';
}

function humanSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`
    : `${Math.round(bytes / 1024)}KB`;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  // /health           liveness only
  // /health?probe=1   actually log in to Combined Storage and report why not,
  //                   so a 502 on upload can be diagnosed without guesswork.
  if (req.method === 'GET' && u.pathname === '/health') {
    const configured = Boolean(BASE && USER && PASS);
    if (!u.searchParams.get('probe')) return send(res, 200, { ok: true, configured });
    if (!configured) {
      return send(res, 200, {
        ok: true, configured: false, reachable: false,
        detail: 'Set CS_BASE_URL, CS_USERNAME and CS_PASSWORD on the uploader service.',
      });
    }
    return login().then(
      () => send(res, 200, { ok: true, configured: true, reachable: true, base: BASE, folder: PARENT }),
      (err) => send(res, 200, { ok: true, configured: true, reachable: false, base: BASE, detail: err.message }),
    );
  }
  const isUpload = req.method === 'POST' && u.pathname === '/upload';
  const isGrab = req.method === 'POST' && u.pathname === '/grab';
  if (!isUpload && !isGrab) return send(res, 404, { error: 'Not found' });

  if (!BASE || !USER || !PASS) {
    return send(res, 503, { error: 'Upload service is not configured (CS_BASE_URL/CS_USERNAME/CS_PASSWORD).' });
  }

  // Pull a logo straight off a website and store it, so nobody has to save and
  // upload an image by hand.
  if (isGrab) {
    const target = u.searchParams.get('url') || '';
    if (!target) return send(res, 400, { error: 'Missing ?url=' });
    return grabSiteImage(target)
      .then((img) => upload(uniqueName(`site${extFor(img.type)}`), img.type, img.buf))
      .then((url) => send(res, 201, { url }))
      .catch((err) => {
        console.error('[uploader] grab:', err.message);
        send(res, 502, { error: err.message });
      });
  }

  const type = String(req.headers['content-type'] || '');
  if (!/^image\//.test(type)) return send(res, 415, { error: 'Only image uploads are accepted.' });

  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > MAX_BYTES) {
    return send(res, 413, { error: `Image is larger than ${humanSize(MAX_BYTES)}.` });
  }

  const chunks = [];
  let total = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    total += c.length;
    if (total > MAX_BYTES) {           // enforce the cap even without a header
      aborted = true;
      send(res, 413, { error: `Image is larger than ${humanSize(MAX_BYTES)}.` });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (aborted) return;
    const buf = Buffer.concat(chunks);
    if (!buf.length) return send(res, 400, { error: 'Empty upload.' });
    try {
      const url = await upload(uniqueName(u.searchParams.get('name')), type, buf);
      send(res, 201, { url });
    } catch (err) {
      console.error('[uploader]', err.message);
      send(res, 502, { error: err.message });
    }
  });
  req.on('error', () => { if (!aborted) send(res, 400, { error: 'Upload stream failed.' }); });
});

server.listen(PORT, () => {
  console.log(`[uploader] listening on :${PORT} -> ${BASE || '(unconfigured)'} folder=${PARENT}`);
});
