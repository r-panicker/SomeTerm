import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { listNodePorts, serveSerialBridge } from '@superserial/transport-node';

const DEV_URL = process.env.SUPERSERIAL_DEV_URL;
/** Ports the OS does not enumerate (socat, other virtual ports), separated by the platform path delimiter. */
const EXTRA_PORTS = (process.env.SUPERSERIAL_EXTRA_PORTS ?? '').split(path.delimiter).filter(Boolean);

async function listPorts() {
  // Enumeration can fail on its own (Linux shells out to udevadm); extra ports must still be offered.
  const found = await listNodePorts().catch((e: Error) => {
    console.warn(`Port enumeration failed: ${e.message}`);
    return [];
  });
  const extra = EXTRA_PORTS.filter((p) => !found.some((f) => f.path === p)).map((p) => ({ path: p, label: p }));
  return [...found, ...extra];
}
let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'SuperSerial',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Capture "View" opens a blob: URL; anything else leaves the app for the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) return { action: 'allow' };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  if (DEV_URL) void win.loadURL(DEV_URL);
  // The build copies the web app next to dist/, both in the repo and inside the package.
  else void win.loadFile(path.join(__dirname, '../web/index.html'));
  win.on('closed', () => (win = null));
}

void app.whenReady().then(() => {
  const stop = serveSerialBridge(
    ipcMain,
    (channel, event) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, event);
    },
    undefined,
    listPorts,
  );
  createWindow();
  app.on('window-all-closed', () => {
    void stop().finally(() => app.quit());
  });
});
