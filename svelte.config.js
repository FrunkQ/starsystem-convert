import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// THE BUILD KNOWS ITS OWN VERSION, the same way the Creator Hub's does. `kit.version.name` defaults to
// a timestamp, which makes every build look different and none identifiable; reading package.json puts
// the release number into `$app/environment`'s `version`, so "is the fix live?" is one look at the
// footer rather than a guess from behaviour.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    version: { name: pkg.version },
    // NO SERVICE WORKER. This tool is one page that does its work in the tab; a precached shell buys
    // nothing and inherits a cutover failure mode forever. The engine's own sw.js is the cautionary
    // tale, and the hub declined it for the same reason (its D-07).
    serviceWorker: { register: false }
  }
};
