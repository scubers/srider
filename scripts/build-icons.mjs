#!/usr/bin/env node
// Regenerates public/icons/icon-{16,48,128}.png from public/icons/icon.svg
// using macOS QuickLook (qlmanage). Run only when the SVG source changes;
// the resulting PNGs are committed so non-macOS builds don't need this tool.
//
// Usage:  npm run icons

import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 48, 128];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_SVG = join(ROOT, 'public', 'icons', 'icon.svg');
const OUT_DIR = join(ROOT, 'public', 'icons');

if (!existsSync(SRC_SVG)) {
  console.error(`Missing source SVG: ${SRC_SVG}`);
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error('This script relies on macOS qlmanage. On other platforms, install rsvg-convert or @resvg/resvg-js and adapt accordingly.');
  process.exit(1);
}

for (const size of SIZES) {
  const tmp = mkdtempSync(join(tmpdir(), `srider-icon-${size}-`));
  try {
    execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, SRC_SVG], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const produced = join(tmp, 'icon.svg.png');
    if (!existsSync(produced)) {
      console.error(`qlmanage did not produce output for size ${size}`);
      process.exit(1);
    }
    const target = join(OUT_DIR, `icon-${size}.png`);
    renameSync(produced, target);
    console.log(`✓ ${target}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
