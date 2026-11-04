<script lang="ts">
  import { native as nativeBridge } from '../lib/session.svelte';

  const version = import.meta.env.VITE_APP_VERSION || 'development build';
  const REPO = 'https://github.com/r-panicker/SuperSerial';
  const native = !!nativeBridge;
</script>

<div class="about">
  <p class="name"><strong>SuperSerial</strong> <span>{version}</span></p>
  <p>Created by <strong>Rajesh Panicker</strong>.</p>

  <h4>Inspired by</h4>
  <ul>
    <li><a href="https://realterm.sourceforge.io/" target="_blank" rel="noopener">RealTerm</a></li>
    <li><a href="https://teratermproject.github.io/" target="_blank" rel="noopener">Tera Term</a></li>
    <li>GTKTerm</li>
    <li>Arduino Serial Plotter</li>
  </ul>
  <p class="note">An independent implementation written from scratch; not affiliated with these projects and sharing no code with them.</p>

  <h4>Built with</h4>
  <ul>
    <li><a href="https://svelte.dev/" target="_blank" rel="noopener">Svelte</a> and <a href="https://vite.dev/" target="_blank" rel="noopener">Vite</a></li>
    <li><a href="https://github.com/leeoniya/uPlot" target="_blank" rel="noopener">uPlot</a> for plotting</li>
    <li><a href="https://xtermjs.org/" target="_blank" rel="noopener">xterm.js</a> for the Screen view</li>
    {#if native}<li><a href="https://serialport.io/" target="_blank" rel="noopener">Node SerialPort</a> and <a href="https://www.electronjs.org/" target="_blank" rel="noopener">Electron</a></li>{/if}
  </ul>

  <p class="repo"><a href={REPO} target="_blank" rel="noopener">Source, releases and user guide</a></p>
</div>

<style>
  .about { font-size: 12.5px; line-height: 1.5; }
  .about p { margin: 0 0 8px; }
  .name span { color: var(--muted); font: 12px var(--mono); margin-left: 4px; }
  h4 { margin: 14px 0 4px; font-size: 12px; font-weight: 600; }
  ul { margin: 0; padding-left: 18px; }
  .note { color: var(--muted); font-size: 12px; margin-top: 6px; }
  a { color: var(--accent); }
  .repo { margin-top: 14px; }
</style>
