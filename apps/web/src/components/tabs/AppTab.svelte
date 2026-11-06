<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import { resetSettings } from '../../lib/profiles.svelte';
  import { prefs, SCROLLBACK, type Theme } from '../../lib/prefs.svelte';
  import AboutPanel from '../AboutPanel.svelte';

  /** `session` is absent for the Monitor, which has no connection settings to reset. */
  let { session }: { session?: Session } = $props();
  let all = $state(false);
  const KEYS: [string, string][] = [
    ['Ctrl+Shift+Enter', 'Connect'],
    ['Ctrl+Shift+1…8', 'Panel tab'],
    ['Ctrl+,', 'Fold panel'],
    ['Ctrl+Shift+Space', 'Change view'],
    ['Ctrl+F', 'Find'],
    ['Ctrl+L', 'Clear'],
    ['Alt+1…9', 'Quick send'],
    ['Ctrl+Tab', 'Next connection'],
    ['Alt+Enter', 'Full screen'],
    ['Esc', 'Send bar'],
    ['Ctrl+wheel', 'Text size'],
  ];

  function reset() {
    if (!session) return;
    const kept = [
      ...(session.open ? ['port settings (while connected)'] : []),
      'profiles',
      ...(all ? [] : ['colour rules', 'auto-replies', 'quick-send buttons', 'send lines', 'theme, text size and scrollback']),
    ];
    if (!confirm(`Reset ${all ? 'everything' : "this connection's settings"} to defaults?\n\nKept: ${kept.join(', ')}.`)) return;
    resetSettings(session, all);
    all = false;
  }
</script>

<div class="groups">
  <div class="stack">
  <fieldset>
    <legend>Appearance</legend>
    <div class="form">
      <label>Theme
        <select value={prefs.theme} onchange={(e) => prefs.setTheme(e.currentTarget.value as Theme)} title="System follows your operating system's light or dark setting">
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </label>
      <label>Scrollback
        <select value={prefs.scrollback} onchange={(e) => prefs.setScrollback(Number(e.currentTarget.value))} title="Lines kept per terminal; older lines leave the view (captures are unaffected)">
          {#each SCROLLBACK as n}<option value={n}>{n.toLocaleString()} lines</option>{/each}
        </select>
      </label>
    </div>
  </fieldset>
  {#if session}
    <fieldset>
      <legend>Reset</legend>
      <div class="row">
        <button onclick={reset} title="This connection's settings back to their defaults; profiles, colour rules, auto-replies, quick-send buttons and send lines are kept unless All is ticked">Reset to defaults</button>
        <label class="check" title="Also reset colour rules, auto-replies, quick-send buttons, send lines, theme, text size and scrollback. Profiles are never deleted here, and port settings stay while connected"><input type="checkbox" bind:checked={all} /> All</label>
      </div>
    </fieldset>
  {/if}
  </div>
  <fieldset class="keys">
    <legend>Keys</legend>
    <dl>
      {#each KEYS as [k, what]}<div><dt>{k}</dt><dd>{what}</dd></div>{/each}
    </dl>
  </fieldset>
  <fieldset class="about">
    <legend>About</legend>
    <AboutPanel />
  </fieldset>
</div>

<style>
  .row { display: flex; gap: 10px; align-items: center; font-size: 12.5px; }
  .about { flex: 1 1 240px; }
  .keys { flex: 2 1 330px; }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .stack > fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px 8px; margin: 0; }
  .stack > fieldset > legend { font-size: 11.5px; font-weight: 600; color: var(--muted); padding: 0 4px; }
  .stack .form { font-size: 12.5px; }
  dl { margin: 0; columns: 13em; column-gap: 16px; font-size: 12px; }
  dl div { display: flex; gap: 8px; break-inside: avoid; line-height: 1.55; }
  dt { font-family: var(--mono); font-size: 11px; min-width: 9.2em; white-space: nowrap; }
  dd { margin: 0; color: var(--muted); }
</style>
