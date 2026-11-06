import { build } from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
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

/** Copies the built web app to web/, where main.ts loads it from in production. */
export function copyWeb() {
  const from = fileURLToPath(new URL('../../web/dist', import.meta.url));
  const to = fileURLToPath(new URL('../web', import.meta.url));
  if (!existsSync(from)) throw new Error('Build the web app first (pnpm --filter @someterm/web build)');
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildElectron();
  copyWeb();
}
