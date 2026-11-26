import { RxPipeline, type NewlineMode, type RecutCommand, type RxBatch, type RxCommand } from '@someterm/core';

const FLUSH_MS = 8;

type Command = RxCommand | RecutCommand;

/**
 * Runs the receive pipeline in a worker, batching results back every few ms.
 * If the worker cannot start, the same pipeline runs inline and replays
 * queued commands in order.
 */
export class PipelineClient {
  mode: 'starting' | 'worker' | 'inline' = 'starting';
  private worker: Worker | null = null;
  private inline: RxPipeline | null = null;
  private queue: Command[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resets = 0;
  /** Results are dropped until the worker acknowledges this reset. */
  private awaiting: number | null = null;

  constructor(
    private readonly onBatch: (b: RxBatch) => void,
    private readonly onRecut: (id: number, b: RxBatch) => void,
  ) {
    try {
      const w = new Worker(new URL('./rx.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<RxBatch | 'ready' | { ack: number } | { recut: number; batch: RxBatch }>) => {
        const d = e.data;
        if (d === 'ready') {
          this.mode = 'worker';
          for (const c of this.queue) w.postMessage(c);
          this.queue = [];
        } else if ('ack' in d) {
          if (d.ack === this.awaiting) this.awaiting = null;
        } else if (this.awaiting !== null) return;
        else if ('recut' in d) this.onRecut(d.recut, d.batch);
        else this.onBatch(d);
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

  /**
   * Restarts parsing. With `discard`, results still in flight from before the
   * reset are dropped (a replay seek re-delivers that data, so they would repeat).
   */
  reset(mode: NewlineMode, offset: number, discard = false): void {
    if (!discard) {
      this.send({ type: 'reset', mode, offset });
      return;
    }
    const ack = ++this.resets;
    if (this.mode === 'inline') {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.inline!.apply({ type: 'reset', mode, offset });
      this.inline!.drain();
      return;
    }
    this.awaiting = ack;
    this.send({ type: 'reset', mode, offset, ack } as RxCommand);
  }

  /** Parses received bytes again with new settings; the result comes to `onRecut`. */
  recut(cmd: RecutCommand): void {
    this.send(cmd, [cmd.bytes.buffer]);
  }

  setWidth(width: number): void {
    this.send({ type: 'width', width });
  }

  dispose(): void {
    this.worker?.terminate();
    clearTimeout(this.timer);
  }

  private send(cmd: Command, transfer: Transferable[] = []): void {
    if (this.mode === 'worker') this.worker!.postMessage(cmd, transfer);
    else if (this.mode === 'starting') this.queue.push(cmd);
    else if (cmd.type === 'recut') {
      clearTimeout(this.timer);
      this.timer = undefined;
      const b = this.inline!.drain();
      if (b) this.onBatch(b);
      const r = RxPipeline.recut(cmd);
      this.inline = r.pipeline;
      this.onRecut(cmd.id, r.batch);
    } else {
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
