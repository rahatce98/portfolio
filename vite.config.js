import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
export default defineConfig({
  root: 'app',
  base: '/portfolio/',
  publicDir: 'public',
  plugins: [react()],
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
          if (!id.includes('node_modules')) return;
          if (id.includes('/three/')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react';
        },
      },
    },
  },
  server: { port: 5178, open: false },
  preview: { port: 4178 },
});
