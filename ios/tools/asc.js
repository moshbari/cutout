#!/usr/bin/env node
// Minimal App Store Connect API client — signs an ES256 JWT with the .p8 key.
// Usage: node asc.js GET /v1/apps?limit=5
//        node asc.js POST /v1/bundleIds '{"data":{...}}'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SECRETS = path.join(os.homedir(), 'Documents/claude-server/secrets.txt');

function secrets() {
  const out = {};
  for (const line of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function token() {
  const s = secrets();
  const key = fs.readFileSync(s.APP_STORE_CONNECT_KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: s.APP_STORE_CONNECT_API_KEY_ID, typ: 'JWT' };
  const payload = { iss: s.APP_STORE_CONNECT_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' };
  const body = `${b64(header)}.${b64(payload)}`;
  const der = crypto.sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' });
  return `${body}.${der.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function call(method, endpoint, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

module.exports = { call, token, secrets };

if (require.main === module) {
  const [method, endpoint, body] = process.argv.slice(2);
  call(method || 'GET', endpoint || '/v1/apps?limit=10', body).then(r => {
    console.log(r.status);
    console.log(JSON.stringify(r.json, null, 2));
  }).catch(e => { console.error(e); process.exit(1); });
}
