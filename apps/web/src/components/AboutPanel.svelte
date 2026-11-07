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
    <a href="{REPO}/releases/latest" target="_blank" rel="noopener" title={native ? undefined : 'For Windows, macOS and Linux; adds TCP and Telnet'}>{native ? 'Updates' : 'Desktop app'}</a>
  </p>
  <p>
    Inspired by <a href="https://realterm.sourceforge.io/" target="_blank" rel="noopener">RealTerm</a>,
    <a href="https://teratermproject.github.io/" target="_blank" rel="noopener">Tera Term</a>, GTKTerm and the Arduino Serial Plotter.
    <span class="muted">Not affiliated with them.</span>
  </p>
</div>

<style>
  .about { font-size: 12.5px; line-height: 1.5; }
  .about p { margin: 0 0 4px; }
  .name span { color: var(--muted); font: 12px var(--mono); margin-left: 2px; }
  .muted { color: var(--muted); }
  a { color: var(--accent); }
</style>
