import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Bundles main and preload. serialport stays external because it loads a native binary. */
export async function buildElectron() {
  const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: true, absWorkingDir: root, logLevel: 'warning' };
  await Promise.all([
    build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', external: ['electron', 'serialport'] }),
    build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', external: ['electron'] }),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildElectron();
