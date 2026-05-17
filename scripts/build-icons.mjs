#!/usr/bin/env node
// Regenerates public/icons/icon-{16,48,128}.png from public/icons/icon.svg
// using @resvg/resvg-js. Preserves transparency outside the rounded square
// (qlmanage, the previous tool, composited onto an opaque white background,
// which is why the icon corners came out white in chrome://extensions).
//
// Run only when the SVG source changes; PNGs are committed so non-Node
// CI runners don't need to regenerate.
//
// Usage:  npm run icons

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [16, 48, 128];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_SVG = join(ROOT, 'public', 'icons', 'icon.svg');
const OUT_DIR = join(ROOT, 'public', 'icons');

const svg = await readFile(SRC_SVG, 'utf8');

for (const size of SIZES) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)', // explicit transparent canvas
  });
  const png = resvg.render().asPng();
  const target = join(OUT_DIR, `icon-${size}.png`);
  await writeFile(target, png);
  console.log(`✓ ${target}`);
}
