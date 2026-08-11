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

  if (req.method === 'GET' && u.pathname === '/health') {
    return send(res, 200, { ok: true, configured: Boolean(BASE && USER && PASS) });
  }
  if (req.method !== 'POST' || u.pathname !== '/upload') {
    return send(res, 404, { error: 'Not found' });
  }
  if (!BASE || !USER || !PASS) {
    return send(res, 503, { error: 'Upload service is not configured (CS_BASE_URL/CS_USERNAME/CS_PASSWORD).' });
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
    // Keep the extension so Combined Storage stores a sensible filename.
    const raw = (u.searchParams.get('name') || 'logo.png').replace(/[/\\]/g, '_').slice(-120);
    try {
      const url = await upload(raw, type, buf);
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
