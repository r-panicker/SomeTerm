import { isTauri } from '@tauri-apps/api/core';

export interface WritableLog {
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  seek(position: number): Promise<unknown>;
  close(): Promise<void>;
}
export interface LogHandle {
  name: string;
  createWritable(options: { keepExistingData: boolean }): Promise<WritableLog>;
  getFile(): Promise<{ size: number }>;
}
export interface LogDirectory {
  name: string;
  getFileHandle(name: string, options: { create: boolean }): Promise<LogHandle>;
}
export const nativeFiles = isTauri();

export async function pickNativeRecording(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({
    multiple: false,
    filters: [{ name: 'SomeTerm recording', extensions: ['strec'] }],
  });
  if (!path) return null;
  const { basename } = await import('@tauri-apps/api/path');
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return { name: await basename(path), bytes: await readFile(path) };
}

async function handle(path: string): Promise<LogHandle> {
  const { basename } = await import('@tauri-apps/api/path');
  return {
    name: await basename(path),
    async createWritable({ keepExistingData }) {
      const { open, SeekMode } = await import('@tauri-apps/plugin-fs');
      const file = await open(path, {
        write: true,
        create: true,
        truncate: !keepExistingData,
      });
      return {
        async write(bytes) {
          // Native writes can be short; keep the capture complete.
          let offset = 0;
          while (offset < bytes.length) {
            const n = await file.write(bytes.subarray(offset));
            if (!n) throw new Error('File write made no progress');
            offset += n;
          }
        },
        seek: (position) => file.seek(position, SeekMode.Start),
        close: () => file.close(),
      };
    },
    async getFile() {
      const { stat } = await import('@tauri-apps/plugin-fs');
      return stat(path);
    },
  };
}
export async function pickNativeLog(name: string): Promise<LogHandle | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: name });
  return path ? handle(path) : null;
}
export async function pickNativeFolder(): Promise<LogDirectory | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({
    directory: true,
    multiple: false,
    recursive: true,
  });
  if (!path) return null;
  const { basename, join } = await import('@tauri-apps/api/path');
  return {
    name: await basename(path),
    async getFileHandle(name) {
      if (!name || /[/\\]/.test(name) || name === '.' || name === '..')
        throw new Error('Invalid log filename');
      return handle(await join(path, name));
    },
  };
}
export async function saveBlob(blob: Blob, name: string): Promise<void> {
  if (nativeFiles) {
    const target = await pickNativeLog(name);
    if (!target) return;
    const stream = await target.createWritable({ keepExistingData: false });
    try {
      await stream.write(new Uint8Array(await blob.arrayBuffer()));
    } finally {
      await stream.close();
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export function installNativeLinks(): void {
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element)?.closest?.('a');
    if (!anchor || !/^https?:/.test(anchor.href)) return;
    event.preventDefault();
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(anchor.href))
      .catch((error) => alert(String(error)));
  });
}
