import { RxPipeline, type RxCommand } from '@superserial/core';

const FLUSH_MS = 8;
const pipeline = new RxPipeline();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const batch = pipeline.drain();
  if (batch) postMessage(batch);
}

self.onmessage = (e: MessageEvent<RxCommand & { ack?: number }>) => {
  pipeline.apply(e.data);
  // Acknowledge a reset in message order, so the page can drop results produced before it.
  if (e.data.type === 'reset' && e.data.ack !== undefined) postMessage({ ack: e.data.ack });
  timer ??= setTimeout(flush, FLUSH_MS);
};

postMessage('ready');
