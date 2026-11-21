// BUILDS THE CONVERTER AS A MODULE that other sites load (Star System Explorer 4, the Explorers site).
//
// Output goes to static/module/v1/, so the site build that follows serves it at /module/v1/convert.js
// beside the page. It is generated, never committed (.gitignore). `v1` is the API version: it moves
// only when a caller would have to change, and `manifest.json` beside the file carries the release and
// the file's sha256 so a caller can pin exactly what it loaded.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      // The one SvelteKit import inside the vendored code; see the file for why a stand-in is enough.
      '$app/environment': fileURLToPath(new URL('./src/lib/module/app-environment.ts', import.meta.url))
    }
  },
  define: { __CONVERT_VERSION__: JSON.stringify(pkg.version) },
  publicDir: false,
  build: {
    outDir: 'static/module/v1',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/lib/module/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'convert.js'
    }
  }
});
