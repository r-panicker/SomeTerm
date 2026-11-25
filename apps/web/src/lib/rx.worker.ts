import { RxPipeline, type RecutCommand, type RxCommand } from '@someterm/core';

const FLUSH_MS = 8;
let pipeline = new RxPipeline();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const batch = pipeline.drain();
  if (batch) postMessage(batch);
}

self.onmessage = (e: MessageEvent<(RxCommand & { ack?: number }) | RecutCommand>) => {
  const d = e.data;
  if (d.type === 'recut') {
    // What the old pipeline found goes out first, so results stay in stream order.
    clearTimeout(timer);
    flush();
    const r = RxPipeline.recut(d);
    pipeline = r.pipeline;
    postMessage({ recut: d.id, batch: r.batch });
    return;
  }
  pipeline.apply(d);
  // Acknowledge a reset in message order, so the page can drop results produced before it.
  if (d.type === 'reset' && d.ack !== undefined) postMessage({ ack: d.ack });
  timer ??= setTimeout(flush, FLUSH_MS);
};

postMessage('ready');
