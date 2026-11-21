// Stand-in for SvelteKit's `$app/environment` in the module build, where there is no SvelteKit.
// One vendored file (rendering/colors.ts) asks whether it is in a browser; that is all it needs.
export const browser = typeof window !== 'undefined';
export const dev = false;
export const building = false;
export const version = '';
