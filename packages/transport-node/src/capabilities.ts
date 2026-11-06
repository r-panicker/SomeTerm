import type { TransportCapabilities } from '@someterm/core';

/** What the native binding (@serialport/bindings-cpp) really implements on each OS. */
export function nodeCapabilities(platform: string = process.platform): TransportCapabilities {
  const win = platform === 'win32';
  return {
    markSpaceParity: win,
    dsrDtrFlow: false,
    xonXoffFlow: true,
    oneAndHalfStopBits: win,
    fiveSixDataBits: true,
    portMetadata: true,
    sendBreak: true,
    lineSignals: true,
    ringIndicator: false,
  };
}
