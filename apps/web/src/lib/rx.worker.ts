import { RxPipeline, type RxCommand } from '@superserial/core';

const FLUSH_MS = 8;
const pipeline = new RxPipeline();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const batch = pipeline.drain();
  if (batch) postMessage(batch);
}

self.onmessage = (e: MessageEvent<RxCommand>) => {
  pipeline.apply(e.data);
  timer ??= setTimeout(flush, FLUSH_MS);
};

postMessage('ready');
