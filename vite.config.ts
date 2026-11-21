import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // SSE4's importer is wasm (src/lib/sse4), inlined with `?inline` so it rides in its own lazy chunk.
  assetsInclude: ['**/*.wasm'],
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
