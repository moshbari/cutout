#!/usr/bin/env node
// Fills the App Store listing for CutOut: description/keywords, subtitle,
// privacy policy URL, category and age rating.
const { call } = require('./asc');

const APP = '6801400774';
const VERSION = '801630a9-baf9-4ced-b237-44f8d79877b9';
const APP_INFO = '73fa44ed-9ddd-4706-9e08-f8b7b31398c2';

const DESCRIPTION = `Remove a column or a row from the middle of a screenshot — and close the gap so it looks like it was never there.

Drag one finger across the part you want gone. CutOut deletes that strip and slides the two remaining halves together. The pixels that stay are untouched; they just get closer. No blurring, no smudging, no AI fill, no black box that screams "this was edited."

SNAPS TO REAL TABLE LINES
Drag roughly and the band jumps onto the actual column and row borders. Because the cut runs through the middle of both shared borders, they rejoin into one clean border. A five-column table becomes a four-column table that looks like it was always four columns.

MADE FOR THE THINGS YOU ACTUALLY SHARE
• Take the card number column out of an expenses table
• Drop one row from a receipt or an invoice
• Cut a paragraph out of the middle of a chat screenshot
• Trim dead space out of a long screenshot
• Remove a price column before you send a quote on

BUILT FOR PRECISION
• Pinch to zoom, with a magnifier that follows the edge you are dragging
• Arrow buttons nudge the band one pixel at a time
• A live readout shows exactly where each edge sits
• Cut as many times as you like — every cut stacks, with full undo and redo
• Hold the eye button to compare against the original at any moment

CUT LINES, IF YOU WANT THEM
Seamless by default. When you would rather the join be visible, choose a thin, dashed, jagged "torn paper", or wave cut line, in any colour and thickness.

COMPLETELY PRIVATE
There is no account, no sign-up, and no server. Your images are read, edited and saved entirely on your iPhone. Nothing is ever uploaded — the app makes no network requests at all and works in aeroplane mode. No ads, no tracking, no analytics.

Saves straight back to your photo library at full resolution, in the same format you started with.`;

const KEYWORDS = 'screenshot,crop,table,column,row,redact,hide,cut,edit,remove,privacy,receipt,trim,splice';

const SUBTITLE = 'Cut a column or row out';

async function put(endpoint, type, id, attributes) {
  const r = await call('PATCH', `${endpoint}/${id}`, { data: { type, id, attributes } });
  console.log(`${r.status} ${endpoint}/${id}`);
  if (r.status >= 300) console.log(JSON.stringify(r.json).slice(0, 500));
  return r;
}

(async () => {
  // ── version localisation: description, keywords, URLs ────────────────
  const locs = await call('GET', `/v1/appStoreVersions/${VERSION}/appStoreVersionLocalizations`);
  const loc = locs.json.data.find(l => l.attributes.locale === 'en-US');
  await put('/v1/appStoreVersionLocalizations', 'appStoreVersionLocalizations', loc.id, {
    description: DESCRIPTION,
    keywords: KEYWORDS,
    supportUrl: 'https://cutout.99dfy.com/',
    marketingUrl: 'https://cutout.99dfy.com/',
    promotionalText: 'Drag a band across a table screenshot and one whole column disappears — the remaining columns slide together with no visible seam.',
  });

  // ── app info localisation: subtitle + privacy policy ─────────────────
  const infoLocs = await call('GET', `/v1/appInfos/${APP_INFO}/appInfoLocalizations`);
  const infoLoc = infoLocs.json.data.find(l => l.attributes.locale === 'en-US');
  await put('/v1/appInfoLocalizations', 'appInfoLocalizations', infoLoc.id, {
    subtitle: SUBTITLE,
    privacyPolicyUrl: 'https://cutout.99dfy.com/privacy.html',
  });

  // ── categories: Photo & Video, then Productivity ─────────────────────
  const cat = await call('PATCH', `/v1/appInfos/${APP_INFO}`, {
    data: {
      type: 'appInfos', id: APP_INFO,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'PHOTO_AND_VIDEO' } },
        secondaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } },
      },
    },
  });
  console.log('categories', cat.status);
  if (cat.status >= 300) console.log(JSON.stringify(cat.json).slice(0, 400));

  // ── age rating: nothing objectionable anywhere ───────────────────────
  const ard = await call('GET', `/v1/appInfos/${APP_INFO}/ageRatingDeclaration`);
  const ardId = ard.json.data && ard.json.data.id;
  if (ardId) {
    const r = await put('/v1/ageRatingDeclarations', 'ageRatingDeclarations', ardId, {
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      contests: 'NONE',
      gamblingSimulated: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      profanityOrCrudeHumor: 'NONE',
      sexualContentGraphicAndNudity: 'NONE',
      sexualContentOrNudity: 'NONE',
      horrorOrFearThemes: 'NONE',
      matureOrSuggestiveThemes: 'NONE',
      violenceCartoonOrFantasy: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
      violenceRealistic: 'NONE',
      gambling: false,
      unrestrictedWebAccess: false,
      kidsAgeBand: null,
    });
    if (r.status >= 300) console.log('age rating body', JSON.stringify(r.json).slice(0, 600));
  } else {
    console.log('no ageRatingDeclaration found');
  }
})();
