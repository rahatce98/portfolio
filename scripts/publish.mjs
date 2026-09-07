#!/usr/bin/env node
/**
 * Mirror dist/ to the repository root.
 *
 * GitHub Pages for this repo is configured as "Deploy from a branch → main /
 * (root)", so the built site has to be committed at the top level. This script
 * is the only thing that writes there.
 *
 * It is deliberately conservative: it removes only the top-level names that the
 * current build actually produced, and refuses to touch anything on the
 * protected list. It will never delete a path it did not just build.
 */
import { cp, rm, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

/** Never removable, whatever the build emits. */
const PROTECTED = new Set([
  '.git', '.github', '.gitignore', 'app', 'dist', 'node_modules', 'package.json',
  'package-lock.json', 'scripts', 'vite.config.js', 'README.md', 'LICENSE',
]);

async function main() {
  if (!existsSync(dist)) {
    console.error('✘ dist/ not found — run `npm run build` first.');
    process.exit(1);
  }

  const entries = await readdir(dist);
  if (entries.length === 0) {
    console.error('✘ dist/ is empty — refusing to publish.');
    process.exit(1);
  }
  if (!entries.includes('index.html')) {
    console.error('✘ dist/index.html is missing — refusing to publish a build with no entry point.');
    process.exit(1);
  }

  const unsafe = entries.filter((e) => PROTECTED.has(e));
  if (unsafe.length) {
    console.error(`✘ Build emitted protected name(s): ${unsafe.join(', ')} — aborting.`);
    process.exit(1);
  }

  // Replace only what this build produced.
  for (const name of entries) {
    const target = path.join(root, name);
    if (existsSync(target)) await rm(target, { recursive: true, force: true });
  }
  for (const name of entries) {
    await cp(path.join(dist, name), path.join(root, name), { recursive: true });
  }

  // Jekyll would otherwise skip any path beginning with an underscore.
  await writeFile(path.join(root, '.nojekyll'), '');

  let bytes = 0;
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else bytes += (await stat(p)).size;
    }
  };
  await walk(dist);

  console.log(`✔ Published ${entries.length} top-level entries to the repository root.`);
  console.log(`  ${entries.join(', ')}`);
  console.log(`  total ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error('✘ publish failed:', err);
  process.exit(1);
});
