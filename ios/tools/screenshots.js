#!/usr/bin/env node
// Uploads App Store screenshots: reserve → PUT the bytes → commit with a checksum.
// node screenshots.js <dir> <shot1.png> <shot2.png> ...
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { call, token } = require('./asc');

const VERSION = '801630a9-baf9-4ced-b237-44f8d79877b9';
const DISPLAY_TYPE = 'APP_IPHONE_67';   // the 6.7" slot, which also accepts 6.9" 1320 × 2868 images

async function ensureSet() {
  const locs = await call('GET', `/v1/appStoreVersions/${VERSION}/appStoreVersionLocalizations`);
  const loc = locs.json.data.find(l => l.attributes.locale === 'en-US');

  const sets = await call('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
  const existing = (sets.json.data || []).find(s => s.attributes.screenshotDisplayType === DISPLAY_TYPE);
  if (existing) return existing.id;

  const made = await call('POST', '/v1/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: DISPLAY_TYPE },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } },
    },
  });
  if (made.status >= 300) throw new Error('set: ' + JSON.stringify(made.json).slice(0, 300));
  return made.json.data.id;
}

async function upload(setId, file) {
  const data = fs.readFileSync(file);
  const name = path.basename(file);

  const reserved = await call('POST', '/v1/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileSize: data.length, fileName: name },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  if (reserved.status >= 300) throw new Error('reserve: ' + JSON.stringify(reserved.json).slice(0, 300));

  const shot = reserved.json.data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: data.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`chunk ${op.offset}: ${res.status}`);
  }

  const checksum = crypto.createHash('md5').update(data).digest('hex');
  const done = await call('PATCH', `/v1/appScreenshots/${shot.id}`, {
    data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: checksum } },
  });
  if (done.status >= 300) throw new Error('commit: ' + JSON.stringify(done.json).slice(0, 300));
  return { name, id: shot.id, state: done.json.data.attributes.assetDeliveryState };
}

(async () => {
  const files = process.argv.slice(2);
  const setId = await ensureSet();
  console.log('screenshot set', setId);
  for (const f of files) {
    const r = await upload(setId, f);
    console.log('✓', r.name, JSON.stringify(r.state));
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
