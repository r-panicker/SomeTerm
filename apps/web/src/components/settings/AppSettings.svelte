<script lang="ts">
  import { prefs, SCROLLBACK, TEXT_SIZES, type Theme } from '../../lib/prefs.svelte';
  import AboutPanel from '../AboutPanel.svelte';

  /** App-wide preferences, the same for every tab and the Monitor. */
</script>

<div class="form">
  <label>Theme
    <select value={prefs.theme} onchange={(e) => prefs.setTheme(e.currentTarget.value as Theme)} title="System follows your operating system's light or dark setting">
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>
  <label>Text size
    <select value={prefs.textSize} onchange={(e) => prefs.setTextSize(Number(e.currentTarget.value))} title="Terminal text in every tab; Ctrl+wheel over the terminal changes it too. Ctrl+= and Ctrl+- zoom the whole window">
      {#each TEXT_SIZES as v, i}<option value={v}>{i === 0 ? 'Normal' : `${Math.round((v / TEXT_SIZES[0]) * 100)}%`}</option>{/each}
    </select>
  </label>
  <label>Scrollback
    <select value={prefs.scrollback} onchange={(e) => prefs.setScrollback(Number(e.currentTarget.value))} title="Lines kept per terminal; older lines leave the view (captures are unaffected)">
      {#each SCROLLBACK as n}<option value={n}>{n.toLocaleString()} lines</option>{/each}
    </select>
  </label>
</div>
<hr />
<AboutPanel />

<style>
  hr { border: 0; border-top: 1px solid var(--line); margin: 16px 0 12px; }
</style>
