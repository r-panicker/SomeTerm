import { mount } from 'svelte';
import { createNativeBridge } from '@someterm/transport-tauri';
import './app.css';

// Visits to the public site only; desktop and self-hosted copies send nothing.
if (location.hostname === 'r-panicker.github.io') {
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = 'https://someterm.goatcounter.com/count';
  document.head.appendChild(script);
}

async function start() {
  // Resolve native capabilities before the shared session model is evaluated.
  const native = await createNativeBridge();
  if (native) {
    const { installNativeLinks } = await import(
      '@someterm/transport-tauri/files'
    );
    installNativeLinks();
  }
  if (native)
    (globalThis as { sometermNative?: typeof native }).sometermNative = native;
  const { default: App } = await import('./App.svelte');
  mount(App, { target: document.getElementById('app')! });
}

void start().catch((error) => {
  document.getElementById('app')!.textContent =
    `SomeTerm could not start: ${error instanceof Error ? error.message : String(error)}`;
});
