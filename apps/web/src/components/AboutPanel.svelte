<script lang="ts">
  import { native as nativeBridge } from '../lib/session.svelte';

  const version = import.meta.env.VITE_APP_VERSION || 'development build';
  const REPO = 'https://github.com/r-panicker/SomeTerm';
  const native = !!nativeBridge;
</script>

<div class="about">
  <p class="name"><strong>SomeTerm</strong> <span>{version}</span> · by <strong>Rajesh Panicker</strong></p>
  <p>
    <a href={REPO} target="_blank" rel="noopener">Source and user guide</a> ·
    <a href="{REPO}/releases/latest" target="_blank" rel="noopener">{native ? 'Updates' : 'Desktop app'}</a>{#if !native}<span class="muted">&nbsp;for Windows, macOS and Linux, with TCP and Telnet</span>{/if}
  </p>
  <p>
    Inspired by <a href="https://realterm.sourceforge.io/" target="_blank" rel="noopener">RealTerm</a>,
    <a href="https://teratermproject.github.io/" target="_blank" rel="noopener">Tera Term</a>, GTKTerm and the Arduino Serial Plotter.
    <span class="muted">Written from scratch; not affiliated with them.</span>
  </p>
  <p class="muted">
    Built with <a href="https://svelte.dev/" target="_blank" rel="noopener">Svelte</a>, <a href="https://vite.dev/" target="_blank" rel="noopener">Vite</a>,
    <a href="https://github.com/leeoniya/uPlot" target="_blank" rel="noopener">uPlot</a> and <a href="https://xtermjs.org/" target="_blank" rel="noopener">xterm.js</a>{#if native}, <a href="https://serialport.io/" target="_blank" rel="noopener">Node SerialPort</a> and <a href="https://www.electronjs.org/" target="_blank" rel="noopener">Electron</a>{/if}.
  </p>
</div>

<style>
  .about { font-size: 12.5px; line-height: 1.5; }
  .about p { margin: 0 0 6px; }
  .name span { color: var(--muted); font: 12px var(--mono); margin-left: 2px; }
  .muted { color: var(--muted); }
  a { color: var(--accent); }
</style>
