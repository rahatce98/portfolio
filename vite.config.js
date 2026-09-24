import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * GitHub Pages serves this repository from https://rahatce98.github.io/portfolio/,
 * so every emitted URL needs the repo subpath. `base` is the only place that is
 * configured — nothing under app/src hard-codes a path, and runtime references
 * to files in public/ go through `import.meta.env.BASE_URL`.
 *
 * Layout note: the Vite root is app/, not the repo root. Pages for this repo is
 * configured to serve `main` at root, which means the *built* index.html has to
 * sit at the repo root — so the source entry cannot also live there. The build
 * writes to dist/ and scripts/publish.mjs mirrors it up to the root.
 *
 * Hashed JS and CSS go to build/ rather than Vite's default assets/, because
 * assets/ is where the static images from public/ land.
 */
const BASE = '/portfolio/';

/**
 * Rahat OS service worker, generated at build time with no plugin dependency.
 * The precache list is the real emitted file set, so it can never drift from
 * the build. The optional office-file libraries (xlsx, pptxgenjs, docx) are left
 * out — they are large and only needed on demand; the worker caches them the
 * first time they are fetched.
 */
function serviceWorker() {
  const optional = /node_modules[\\/](xlsx|pptxgenjs|docx|jszip)[\\/]/;
  return {
    name: 'rahat-os-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = [];
      for (const [name, out] of Object.entries(bundle)) {
        if (!/\.(js|css)$/.test(name)) continue;
        if (out.type === 'chunk' && Object.keys(out.modules || {}).some((m) => optional.test(m))) continue;
        files.push(name);
      }
      const statics = ['', 'index.html', 'manifest.webmanifest', 'tools.json', 'bookmarks.json', 'assets/favicon.svg', 'assets/img/profile.jpg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];
      const precache = [...statics, ...files.sort()].map((f) => BASE + f);
      const version = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 10);
      const src = readFileSync(new URL('./scripts/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__BASE__', BASE)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig({
  root: 'app',
  base: BASE,
  publicDir: 'public',
  plugins: [react(), serviceWorker()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'build',
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the WebGL stack from app code so the shell paints before
        // three.js is parsed, and so app edits do not bust the vendor cache.
        manualChunks(id) {
          // Vite's dynamic-import helper has no node_modules path, so without
          // this Rollup parked it inside the r3f chunk — which made the entry
          // statically import r3f + three and preload ~1 MB of WebGL code on
          // every device, phones included. It belongs with React, which the
          // entry needs anyway.
          if (id.includes('vite/preload-helper')) return 'react';
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
  server: { port: 5178, open: false },
  preview: { port: 4178 },
});
