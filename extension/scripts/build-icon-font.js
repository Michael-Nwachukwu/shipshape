// Builds media/fonts/shipshape-icons.woff containing a single glyph
// mapped to PUA codepoint U+E001, named "shipshape-logo".
//
// Source silhouette comes from media/icons/shipshape.svg (100x100 viewBox).
// We merge all subpaths, scale to 1024x1024, and flip Y for SVG-font coordinate
// space (baseline at 0, ascent up). Descent = 128, ascent = 896.

const fs = require('fs');
const path = require('path');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');

const UNITS_PER_EM = 1024;
const ASCENT = 896;
const DESCENT = -128; // font metrics (below baseline)
const SCALE = UNITS_PER_EM / 100; // 10.24

// Transform a point from 100x100 image space (y-down, origin top-left)
// to 1024 font space (y-up, origin at baseline).
// new_x = x * SCALE
// new_y = ASCENT - (y * SCALE)   ← equivalent to 1024 - |DESCENT| - y*SCALE
function tx(x) { return +(x * SCALE).toFixed(3); }
function ty(y) { return +(ASCENT - y * SCALE).toFixed(3); }

// Each subpath is given in the ORIGINAL 100x100 coords.
// We build them as arrays of tokens: strings (command letters) or [x, y] pairs.
// Arc/quadratic control points are also points and need the same transform.
// We only use: M, L, Q, Z here — matching the source SVG.

const subpaths = [
  // Deploy arrow (mast top)
  [
    'M', [50, 13], 'L', [44, 25], 'L', [48.2, 25], 'L', [48.2, 28],
    'L', [51.8, 28], 'L', [51.8, 25], 'L', [56, 25], 'Z',
  ],
  // Mast (rect 48.5,28 w=3 h=40 rx=1 → approximated as rounded rect with Q corners)
  [
    'M', [49.5, 28], 'L', [50.5, 28], 'Q', [51.5, 28], [51.5, 29],
    'L', [51.5, 67], 'Q', [51.5, 68], [50.5, 68], 'L', [49.5, 68],
    'Q', [48.5, 68], [48.5, 67], 'L', [48.5, 29], 'Q', [48.5, 28], [49.5, 28], 'Z',
  ],
  // Main sail
  [
    'M', [51.5, 32], 'L', [72, 68], 'L', [51.5, 68], 'Z',
  ],
  // Foresail (kept — gives the sailboat its classic two-sail silhouette)
  [
    'M', [48.5, 38], 'L', [33, 68], 'L', [48.5, 68], 'Z',
  ],
  // Deck (rect 22,68 w=56 h=5 rx=1)
  [
    'M', [23, 68], 'L', [77, 68], 'Q', [78, 68], [78, 69],
    'L', [78, 72], 'L', [22, 72], 'L', [22, 69], 'Q', [22, 68], [23, 68], 'Z',
  ],
  // Hull
  [
    'M', [22, 72], 'L', [78, 72], 'L', [72, 84],
    'Q', [50, 88], [28, 84], 'Z',
  ],
];

function renderSubpath(tokens) {
  const out = [];
  for (const t of tokens) {
    if (typeof t === 'string') {
      out.push(t);
    } else {
      out.push(`${tx(t[0])} ${ty(t[1])}`);
    }
  }
  return out.join(' ');
}

const pathD = subpaths.map(renderSubpath).join(' ');

// Sanity: mast top (y=28 in source) should map high on the glyph (close to ascent).
// ty(28) = 896 - 28*10.24 = 896 - 286.72 = 609.28  ✓ well above baseline
// Arrow tip y=13 → ty = 896 - 133.12 = 762.88       ✓ highest point
// Hull bottom y=88 → ty = 896 - 901.12 = -5.12      ✓ just below baseline (descent = -128)

const svgFont = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <font id="shipshape" horiz-adv-x="${UNITS_PER_EM}">
      <font-face font-family="shipshape" units-per-em="${UNITS_PER_EM}" ascent="${ASCENT}" descent="${DESCENT}"/>
      <missing-glyph horiz-adv-x="0"/>
      <glyph unicode="&#xE001;" glyph-name="shipshape-logo" horiz-adv-x="${UNITS_PER_EM}" d="${pathD}"/>
    </font>
  </defs>
</svg>
`;

const debugSvgPath = path.join(__dirname, 'shipshape-font.svg');
fs.writeFileSync(debugSvgPath, svgFont, 'utf8');

const ttf = svg2ttf(svgFont, { description: 'ShipShape icon font', url: 'https://github.com/michael-nwachukwu/shipshape' });
const ttfBuffer = Buffer.from(ttf.buffer);

const woffUint8 = ttf2woff(new Uint8Array(ttfBuffer));
const woffBuffer = Buffer.from(woffUint8.buffer);

const outPath = path.join(__dirname, '..', 'media', 'fonts', 'shipshape-icons.woff');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, woffBuffer);

console.log(`Wrote ${outPath} (${woffBuffer.length} bytes)`);
console.log(`Debug SVG font at ${debugSvgPath}`);
