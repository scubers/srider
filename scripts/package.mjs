#!/usr/bin/env node
// Builds the production bundle and zips dist/ into release/srider-v<version>.zip,
// ready to upload to the Chrome Web Store or Edge Add-ons. Idempotent: a
// previous zip at the same path is overwritten.
//
// Usage:  npm run package

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const RELEASE_DIR = join(ROOT, 'release');

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const target = join(RELEASE_DIR, `srider-v${version}.zip`);

console.log(`[1/3] Building production bundle...`);
execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

if (!existsSync(DIST)) {
  console.error('dist/ missing after build');
  process.exit(1);
}

mkdirSync(RELEASE_DIR, { recursive: true });
if (existsSync(target)) {
  rmSync(target);
}

console.log(`\n[2/3] Zipping dist/ → ${target}`);
// `zip -r <out> .` from inside dist/ keeps the archive's root flat, which is
// what Chrome Web Store and Edge Add-ons expect (manifest.json at top level).
execFileSync('zip', ['-r', '-X', target, '.'], {
  cwd: DIST,
  stdio: 'inherit',
});

console.log(`\n[3/3] Done. Upload candidate:`);
console.log(`  ${target}`);
