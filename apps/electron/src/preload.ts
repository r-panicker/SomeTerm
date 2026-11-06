import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type BridgeEvent, type NativeSerialBridge } from '@someterm/transport-node/bridge';
import { nodeCapabilities } from '@someterm/transport-node/capabilities';

const bridge: NativeSerialBridge = {
  capabilities: nodeCapabilities(process.platform),
  list: () => ipcRenderer.invoke(CHANNELS.list),
  open: (path, options) => ipcRenderer.invoke(CHANNELS.open, path, options),
  close: (path) => ipcRenderer.invoke(CHANNELS.close, path),
  write: (path, data) => ipcRenderer.invoke(CHANNELS.write, path, data),
  setSignals: (path, s) => ipcRenderer.invoke(CHANNELS.setSignals, path, s),
  getSignals: (path) => ipcRenderer.invoke(CHANNELS.getSignals, path),
  sendBreak: (path, ms) => ipcRenderer.invoke(CHANNELS.sendBreak, path, ms),
  onEvent: (cb) => {
    const h = (_e: unknown, ev: BridgeEvent) => cb(ev);
    ipcRenderer.on(CHANNELS.event, h);
    return () => void ipcRenderer.off(CHANNELS.event, h);
  },
};

contextBridge.exposeInMainWorld('sometermNative', bridge);
