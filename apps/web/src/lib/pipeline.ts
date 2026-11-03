import { RxPipeline, type NewlineMode, type RxBatch, type RxCommand } from '@superserial/core';

const FLUSH_MS = 8;

/**
 * Runs the receive pipeline in a worker, batching results back every few ms.
 * If the worker cannot start (some file:// setups refuse module workers), the
 * same pipeline runs inline; commands sent before that is known are replayed.
 */
export class PipelineClient {
  mode: 'starting' | 'worker' | 'inline' = 'starting';
  private worker: Worker | null = null;
  private inline: RxPipeline | null = null;
  private queue: RxCommand[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onBatch: (b: RxBatch) => void) {
    try {
      const w = new Worker(new URL('./rx.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<RxBatch | 'ready'>) => {
        if (e.data === 'ready') {
          this.mode = 'worker';
          for (const c of this.queue) w.postMessage(c);
          this.queue = [];
        } else this.onBatch(e.data);
      };
      w.onerror = () => {
        if (this.mode === 'starting') this.fallBack();
      };
      this.worker = w;
    } catch {
      this.fallBack();
    }
  }

  data(chunk: Uint8Array, time: number): void {
    // Copy so the transfer cannot detach a buffer that capture or the ring still reference.
    const copy = chunk.slice();
    this.send({ type: 'data', chunk: copy, time }, [copy.buffer]);
  }

  reset(mode: NewlineMode, offset: number): void {
    this.send({ type: 'reset', mode, offset });
  }

  dispose(): void {
    this.worker?.terminate();
    clearTimeout(this.timer);
  }

  private send(cmd: RxCommand, transfer: Transferable[] = []): void {
    if (this.mode === 'worker') this.worker!.postMessage(cmd, transfer);
    else if (this.mode === 'starting') this.queue.push(cmd);
    else {
      this.inline!.apply(cmd);
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        const b = this.inline!.drain();
        if (b) this.onBatch(b);
      }, FLUSH_MS);
    }
  }

  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    this.mode = 'inline';
    this.inline = new RxPipeline();
    const queued = this.queue;
    this.queue = [];
    for (const c of queued) this.send(c);
  }
}
