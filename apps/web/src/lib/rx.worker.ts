import { RxPipeline, type RxCommand } from '@someterm/core';

const FLUSH_MS = 8;
const pipeline = new RxPipeline();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const batch = pipeline.drain();
  if (batch) postMessage(batch);
}

self.onmessage = (e: MessageEvent<RxCommand | { type: 'config'; showBsAndCrAsSymbols: boolean } & { ack?: number }>) => {
  if (e.data.type === 'config') {
    pipeline.showBsAndCrAsSymbols = e.data.showBsAndCrAsSymbols;
    return;
  }
  pipeline.apply(e.data as RxCommand);
  // Acknowledge a reset in message order, so the page can drop results produced before it.
  if ((e.data as RxCommand).type === 'reset' && (e.data as RxCommand & { ack?: number }).ack !== undefined) postMessage({ ack: (e.data as RxCommand & { ack?: number }).ack });
  timer ??= setTimeout(flush, FLUSH_MS);
};

postMessage('ready');
