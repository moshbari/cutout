#!/usr/bin/env node
// CutOut 1.1 — the Blur tool. Fills the new version's listing, attaches build 5,
// copies review details, and submits for review.
const { call } = require('./asc');

const APP = '6801400774';
const V11 = '88dca0b1-ea2d-4f3c-8253-b34b7d334fe4';
const V10 = '801630a9-baf9-4ced-b237-44f8d79877b9';

const DESCRIPTION = `Take a column out of the middle of a screenshot. Blur what's private. Circle the thing you mean. Write a note that is actually readable. Then send it.

CUT THE MIDDLE OUT
Drag one finger across the part you want gone. CutOut deletes that strip and slides the two remaining halves together. The pixels that stay are untouched — they just get closer. No AI fill, no black box that screams "this was edited."

It snaps to real table lines, so drag roughly and the band jumps onto the actual column and row borders. Because the cut runs through the middle of both shared borders, they rejoin into one clean border. A five-column table becomes a four-column table that looks like it always was one.

BLUR WITH YOUR FINGER
Pick Blur and brush over a name, a number or a face. Going over the same spot again never makes it blurrier — one even layer, however many strokes it took.

A blur stays live like every other mark. Tap it later to make it lighter or stronger with a slider, drag its corners to resize it, or move it with its grip. Blur always sits on the picture itself, so your arrows and notes stay sharp on top of it.

MARK IT UP
Box, Circle, Arrow and Text. Drag to draw a shape, tap to place a note.

Every mark stays live until you save. Tap it to select, drag it to move, drag its corner to resize, tap a colour dot to recolour. Tap a selected note again to change its words. Nothing is baked in, so you can keep adjusting.

NOTES YOU CAN ACTUALLY READ
Most editors leave you fighting the text. Here a note is a chip, and the chip is built from the text itself — so the padding, the corner radius and the line spacing all scale with the font size. Drag the corner to make it bigger and the box re-fits itself. There is no box to line up by hand.

White words on red, blue and purple chips, black words on yellow, orange and green. Shapes carry a contrasting hairline, so a red circle reads on a white table and on a dark dashboard alike.

MADE FOR THE THINGS YOU ACTUALLY SEND
• Take the card number column out of an expenses table
• Blur a name or an account number before you share
• Circle the line item that is wrong and point at it
• Drop one row from a receipt or an invoice
• Remove a price column before you forward a quote

BUILT FOR PRECISION
• Pinch to zoom, with a magnifier that follows the edge you are dragging
• Arrow buttons nudge the band one pixel at a time
• Cut as many times as you like — every cut stacks, with full undo and redo
• Hold the eye button to compare against the original at any moment

COMPLETELY PRIVATE
No account, no sign-up, no server. Your images are read, edited and saved entirely on your iPhone. Nothing is ever uploaded — the app makes no network requests at all and works in aeroplane mode. No ads, no tracking, no analytics.

Saves straight back to your photo library at full resolution.`;

const WHATS_NEW = `NEW: Blur.
• Brush over anything private with your finger to blur it
• Painting over the same spot twice never makes it blurrier
• Tap a blur any time to change its strength, resize it or move it
• Blur sits under your arrows, circles and notes, so they stay sharp`;

const PROMO = 'Cut a column out of a table screenshot, blur what is private with a finger, circle what matters, and add a note that stays readable.';
const KEYWORDS = 'screenshot,annotate,markup,blur,arrow,circle,redact,crop,table,column,row,note,receipt,hide';

const NOTES_EXTRA = `\n\nNEW IN 1.1 — Blur:\n6. Tap "Blur" and brush a finger over any text. It blurs. Brush over the same place again: it does not get blurrier.\n7. Use the "Blur" slider to change the strength of the selected blur. Switch to another tool, then tap the blur again to re-select it: the slider, corner handles, the round move grip above it, and Delete all work on it.`;

const must = (r, what) => { console.log(r.status, what); if (r.status >= 300) { console.log(JSON.stringify(r.json).slice(0, 800)); process.exit(1); } return r; };

(async () => {
  // 1. listing
  const locs = must(await call('GET', `/v1/appStoreVersions/${V11}/appStoreVersionLocalizations`), 'localizations');
  const loc = locs.json.data.find(l => l.attributes.locale === 'en-US');
  must(await call('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: {
    description: DESCRIPTION, whatsNew: WHATS_NEW, promotionalText: PROMO, keywords: KEYWORDS,
    supportUrl: 'https://cutout.99dfy.com/', marketingUrl: 'https://cutout.99dfy.com/',
  } } }), 'listing');

  // 2. build 5
  const builds = must(await call('GET', `/v1/builds?filter[app]=${APP}&filter[version]=5&filter[preReleaseVersion.version]=1.1`), 'find build');
  const build = builds.json.data[0];
  if (!build) { console.log('build 5 not found'); process.exit(1); }
  must(await call('PATCH', `/v1/appStoreVersions/${V11}/relationships/build`, { data: { type: 'builds', id: build.id } }), 'attach build');

  // 3. review details, carried over from 1.0 plus the blur steps
  const old = (await call('GET', `/v1/appStoreVersions/${V10}/appStoreReviewDetail`)).json.data.attributes;
  const attrs = { ...old, notes: old.notes.replace(/\n\nNEW IN 1\.1[\s\S]*$/, '').replace('5. Tap Save', '5. Tap Save') + NOTES_EXTRA };
  const cur = await call('GET', `/v1/appStoreVersions/${V11}/appStoreReviewDetail`);
  if (cur.status === 200 && cur.json.data) {
    must(await call('PATCH', `/v1/appStoreReviewDetails/${cur.json.data.id}`, { data: { type: 'appStoreReviewDetails', id: cur.json.data.id, attributes: attrs } }), 'review detail (update)');
  } else {
    must(await call('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: V11 } } } } }), 'review detail (create)');
  }

  if (process.argv[2] !== 'submit') { console.log('prepared — run with "submit" to send for review'); return; }

  // 4. submit
  const sub = must(await call('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: APP } } } } }), 'review submission');
  must(await call('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems',
    relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.json.data.id } },
                     appStoreVersion: { data: { type: 'appStoreVersions', id: V11 } } } } }), 'submission item');
  must(await call('PATCH', `/v1/reviewSubmissions/${sub.json.data.id}`, { data: { type: 'reviewSubmissions', id: sub.json.data.id, attributes: { submitted: true } } }), 'SUBMITTED');
})();
