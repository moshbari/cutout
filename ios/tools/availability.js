#!/usr/bin/env node
// Make the app available for sale in every App Store territory.
//
// An approved version (READY_FOR_DISTRIBUTION) still shows nothing in the store
// until an availability record exists — GET /v1/apps/{id}/appAvailabilityV2 404s
// and App Store Connect calls it "eligible for distribution".
//
// Inline-created included entities need *local* ids of the literal form ${USA};
// a bare territory code returns 409 ENTITY_ERROR.INCLUDED.INVALID_ID.
//
// Usage: node availability.js [appId]
const { call } = require('./asc.js');

const APP_ID = process.argv[2] || '6801400774'; // CutOut

(async () => {
  const existing = await call('GET', `/v2/appAvailabilities/${APP_ID}`);
  if (existing.status === 200) {
    console.log('Availability already exists for', APP_ID);
  } else {
    const t = await call('GET', '/v1/territories?limit=200');
    const ids = t.json.data.map(d => d.id);
    const local = id => '${' + id + '}';
    const r = await call('POST', '/v2/appAvailabilities', {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          territoryAvailabilities: {
            data: ids.map(id => ({ type: 'territoryAvailabilities', id: local(id) })),
          },
        },
      },
      included: ids.map(id => ({
        type: 'territoryAvailabilities',
        id: local(id),
        attributes: { available: true },
        relationships: { territory: { data: { type: 'territories', id } } },
      })),
    });
    if (r.status !== 201) {
      console.error(r.status, JSON.stringify(r.json, null, 2));
      process.exit(1);
    }
    console.log(`Created availability across ${ids.length} territories.`);
  }

  const check = await call('GET', `/v2/appAvailabilities/${APP_ID}/territoryAvailabilities?limit=200&fields[territoryAvailabilities]=available`);
  const avail = check.json.data.filter(d => d.attributes.available).length;
  console.log(`Available in ${avail} of ${check.json.data.length} territories.`);
})();
