import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildElectron } from './build.mjs';

const require = createRequire(import.meta.url);
const electron = require('electron');
const webDir = fileURLToPath(new URL('../../web', import.meta.url));
const port = process.env.SOMETERM_PORT ?? '5174';
const url = `http://localhost:${port}/`;

await buildElectron();

const vite = spawn('pnpm', ['exec', 'vite', '--port', port, '--strictPort'], { cwd: webDir, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  vite.stdout.on('data', (d) => { if (String(d).includes(url)) resolve(); });
  vite.on('exit', (code) => reject(new Error(`vite exited with ${code}`)));
});

const app = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, SOMETERM_DEV_URL: url } });
const stop = () => { vite.kill(); app.kill(); };
app.on('exit', (code) => { vite.kill(); process.exit(code ?? 0); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
