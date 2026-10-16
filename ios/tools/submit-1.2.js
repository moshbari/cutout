#!/usr/bin/env node
// CutOut 1.2 — PDFs (open from Files, edit every page, save back as one PDF) + Rotate.
// Creates the version, carries the listing and review notes over from 1.1, attaches build 6, submits.
const { call } = require('./asc');

const APP = '6801400774';
const V11 = '88dca0b1-ea2d-4f3c-8253-b34b7d334fe4';

const WHATS_NEW = `NEW: PDFs and Rotate.
• Open a PDF from Files and edit any page — cut out a column or row, box, circle, arrow, note, blur
• Flip between pages; each page keeps its own edits and its own undo
• Tap PDF to save every page back as one PDF — to Files, Mail, AirDrop and more
• New Rotate button turns the picture 90° per tap, and your marks turn with it
• Pictures kept in Files (including HEIC) open too`;

const PDF_SECTION = `

PDFs TOO
Open a PDF from Files and every tool works on its pages. Flip between pages — each keeps its own cuts, marks and undo — then tap PDF to save the whole document back as one PDF. Any picture can be saved as a PDF the same way.

ROTATE
Turn the picture 90° with one tap. Boxes, arrows and blur turn with it; notes stay upright.`;

const NOTES_EXTRA = `\n\nNEW IN 1.2 — PDFs and Rotate:\n8. Tap the picture button (top left), choose "Files (PDF or image)" and pick any PDF. Its first page opens; a "‹ 1 / N ›" switcher (top left) moves between pages. Every tool works on each page.\n9. Tap "PDF" (top bar): the share sheet opens with the edited PDF — choose "Save to Files".\n10. Tap the circular-arrow button (bottom bar, left of the sliders button) to rotate 90°.`;

const must = (r, what) => { console.log(r.status, what); if (r.status >= 300) { console.log(JSON.stringify(r.json).slice(0, 800)); process.exit(1); } return r; };

(async () => {
  // 0. the version itself
  const vs = must(await call('GET', `/v1/apps/${APP}/appStoreVersions?filter[versionString]=1.2`), 'find 1.2');
  let V12 = vs.json.data[0]?.id;
  if (!V12) {
    V12 = must(await call('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString: '1.2', releaseType: 'AFTER_APPROVAL' },
      relationships: { app: { data: { type: 'apps', id: APP } } } } }), 'create 1.2').json.data.id;
  }

  // 1. listing — 1.1's text plus the new sections
  const prev = must(await call('GET', `/v1/appStoreVersions/${V11}/appStoreVersionLocalizations`), '1.1 listing')
    .json.data.find(l => l.attributes.locale === 'en-US').attributes;
  let description = prev.description;
  if (!description.includes('PDFs TOO')) {
    description = description.replace('\n\nMADE FOR THE THINGS YOU ACTUALLY SEND', PDF_SECTION + '\n\nMADE FOR THE THINGS YOU ACTUALLY SEND');
  }
  description = description.replace('Saves straight back to your photo library at full resolution.',
    'Saves straight back to your photo library at full resolution, or as a PDF.');
  const keywords = 'screenshot,annotate,markup,blur,arrow,circle,redact,pdf,table,column,row,note,receipt,rotate';
  const locs = must(await call('GET', `/v1/appStoreVersions/${V12}/appStoreVersionLocalizations`), 'localizations');
  const loc = locs.json.data.find(l => l.attributes.locale === 'en-US');
  must(await call('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: {
    description, whatsNew: WHATS_NEW, promotionalText: prev.promotionalText, keywords,
    supportUrl: prev.supportUrl, marketingUrl: prev.marketingUrl,
  } } }), 'listing');

  // 2. build 6
  const builds = must(await call('GET', `/v1/builds?filter[app]=${APP}&filter[version]=6&filter[preReleaseVersion.version]=1.2`), 'find build');
  const build = builds.json.data[0];
  if (!build) { console.log('build 6 not found'); process.exit(1); }
  must(await call('PATCH', `/v1/appStoreVersions/${V12}/relationships/build`, { data: { type: 'builds', id: build.id } }), 'attach build');

  // 3. review details, carried over from 1.1 plus the PDF steps
  const old = (await call('GET', `/v1/appStoreVersions/${V11}/appStoreReviewDetail`)).json.data.attributes;
  const attrs = { ...old, notes: old.notes.replace(/\n\nNEW IN 1\.2[\s\S]*$/, '') + NOTES_EXTRA };
  const cur = await call('GET', `/v1/appStoreVersions/${V12}/appStoreReviewDetail`);
  if (cur.status === 200 && cur.json.data) {
    must(await call('PATCH', `/v1/appStoreReviewDetails/${cur.json.data.id}`, { data: { type: 'appStoreReviewDetails', id: cur.json.data.id, attributes: attrs } }), 'review detail (update)');
  } else {
    must(await call('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: V12 } } } } }), 'review detail (create)');
  }

  if (process.argv[2] !== 'submit') { console.log('prepared — run with "submit" to send for review'); return; }

  // 4. submit
  const sub = must(await call('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: APP } } } } }), 'review submission');
  must(await call('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems',
    relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.json.data.id } },
                     appStoreVersion: { data: { type: 'appStoreVersions', id: V12 } } } } }), 'submission item');
  must(await call('PATCH', `/v1/reviewSubmissions/${sub.json.data.id}`, { data: { type: 'reviewSubmissions', id: sub.json.data.id, attributes: { submitted: true } } }), 'SUBMITTED');
  console.log('version', V12);
})();
