# CutOut

Snagit's **Cut Out** tool, as an app you can keep on your iPhone.

Drag a band across a screenshot or photo — CutOut deletes that strip and slides the two
remaining halves together. One column out of the middle of a table, one row out of a
receipt, one paragraph out of a chat screenshot. No smudging, no AI fill, no visible edit:
the pixels that stay are untouched, they just get closer together.

## What it does

- **Vertical or horizontal** — remove a column or a row, direction picked from your drag
- **Snaps to real table lines.** Drag roughly and the band jumps onto the actual column /
  row borders, so the two halves rejoin into one clean border
- **Cut as many times as you like** — every cut stacks, with full undo / redo
- **Seam styles** — seamless (default), thin line, dashed, jagged "torn paper", wave —
  the same cut-line options Snagit offers
- **Pixel-exact** — pinch to zoom, a magnifier follows the edge you're dragging, and the
  arrow buttons nudge one pixel at a time
- **Hold 👁 to compare** against the original at any moment
- **Save** hands the result to the iOS share sheet → *Save Image*

## Privacy

There is no backend. The server does nothing but hand you an HTML file — every pixel is
processed on the device and never leaves it. It also works with no signal at all: add it
to your Home Screen once and it runs offline.

## Install on iPhone

1. Open the site in Safari
2. Share → **Add to Home Screen**
3. It launches full-screen, with no browser chrome, like any other app

## Running locally

```bash
npm start        # http://localhost:3000
npm run icons    # regenerate the app icons
```

## Layout

```
public/index.html   the whole app — UI, cut engine, edge detection
public/sw.js        offline cache
server.js           static file server, zero dependencies
tools/make-icons.js dependency-free PNG icon generator
```
