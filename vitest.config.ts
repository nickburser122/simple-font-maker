import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: { include: ['tests/**/*.test.ts'], css: { include: [/tokens\.css/] }, server: { deps: { inline: ['esm-potrace-wasm', 'opentype.js'] } } },
});
