import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  choose: vi.fn(),
  open: vi.fn(),
  stat: vi.fn(),
  seek: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: mock.save,
  open: mock.choose,
}));
vi.mock('@tauri-apps/api/path', () => ({
  basename: async (path: string) => path.split('/').at(-1),
  join: async (...parts: string[]) => parts.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  open: mock.open,
  stat: mock.stat,
  SeekMode: { Start: 0 },
}));
import { pickNativeLog, pickNativeFolder, saveBlob } from './files';
beforeEach(() => {
  vi.clearAllMocks();
  mock.save.mockResolvedValue('/logs/test.bin');
  mock.choose.mockResolvedValue('/logs');
  mock.stat.mockResolvedValue({ size: 123 });
  mock.open.mockResolvedValue({
    write: mock.write,
    seek: mock.seek,
    close: mock.close,
  });
  mock.write.mockImplementation(async (bytes: Uint8Array) =>
    Math.min(2, bytes.length),
  );
});
describe('native file adapters', () => {
  it('writes all bytes when the OS performs short writes and closes the file', async () => {
    await saveBlob(new Blob([Uint8Array.of(0, 128, 255, 13, 10)]), 'test.bin');
    expect(mock.open).toHaveBeenCalledWith('/logs/test.bin', {
      write: true,
      create: true,
      truncate: true,
    });
    expect(mock.write.mock.calls.map(([b]) => [...b])).toEqual([
      [0, 128, 255, 13, 10],
      [255, 13, 10],
      [10],
    ]);
    expect(mock.close).toHaveBeenCalledOnce();
  });
  it('preserves contents when opening for append and exposes the existing size', async () => {
    const target = (await pickNativeLog('test.bin'))!;
    const file = await target.createWritable({ keepExistingData: true });
    await file.seek((await target.getFile()).size);
    expect(mock.open).toHaveBeenCalledWith('/logs/test.bin', {
      write: true,
      create: true,
      truncate: false,
    });
    expect(mock.seek).toHaveBeenCalledWith(123, 0);
  });
  it('does not create files when the user cancels', async () => {
    mock.save.mockResolvedValueOnce(null);
    await saveBlob(new Blob(['test']), 'test.bin');
    expect(mock.open).not.toHaveBeenCalled();
  });
  it('closes the file if a write fails', async () => {
    mock.write.mockRejectedValueOnce('disk full');
    await expect(saveBlob(new Blob(['test']), 'test.bin')).rejects.toBe(
      'disk full',
    );
    expect(mock.close).toHaveBeenCalledOnce();
  });
  it('uses only filenames within the picked rotation directory', async () => {
    const dir = (await pickNativeFolder())!;
    expect(mock.choose).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      recursive: true,
    });
    await expect(
      dir.getFileHandle('../escape', { create: true }),
    ).rejects.toThrow('Invalid log filename');
    const target = await dir.getFileHandle('part-2.txt', { create: true });
    await target.createWritable({ keepExistingData: false });
    expect(mock.open).toHaveBeenCalledWith('/logs/part-2.txt', {
      write: true,
      create: true,
      truncate: true,
    });
  });
});
