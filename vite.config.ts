import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function precacheSw(): Plugin {
  let root = process.cwd();
  let outDir = resolve(root, 'dist');
  return {
    name: 'precache-sw',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    async closeBundle() {
      const files = walk(outDir)
        .map((f) => './' + relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== './sw.js')
        .sort();
      const list = ['./', ...files];
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 10);
      const out = await transformWithEsbuild(readFileSync(join(root, 'src/sw.ts'), 'utf8'), 'sw.ts', {
        target: 'es2022',
      });
      writeFileSync(
        join(outDir, 'sw.js'),
        `const PRECACHE=${JSON.stringify(list)};const VERSION=${JSON.stringify(version)};\n${out.code}`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), precacheSw()],
  build: { target: 'es2022' },
});
