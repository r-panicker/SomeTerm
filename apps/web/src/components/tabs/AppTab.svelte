<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import { resetSettings } from '../../lib/profiles.svelte';
  import AboutPanel from '../AboutPanel.svelte';

  /** `session` is absent for the Monitor, which has no connection settings to reset. */
  let { session }: { session?: Session } = $props();
  let all = $state(false);

  function reset() {
    if (!session) return;
    const kept = [
      ...(session.open ? ['port settings (while connected)'] : []),
      'profiles',
      ...(all ? [] : ['colour rules', 'auto-replies', 'quick-send buttons', 'send lines', 'text size and scrollback']),
    ];
    if (!confirm(`Reset ${all ? 'everything' : "this connection's settings"} to defaults?\n\nKept: ${kept.join(', ')}.`)) return;
    resetSettings(session, all);
    all = false;
  }
</script>

<div class="groups">
  {#if session}
    <fieldset>
      <legend>Reset</legend>
      <div class="row">
        <button onclick={reset} title="This connection's settings back to their defaults; profiles, colour rules, auto-replies, quick-send buttons and send lines are kept unless All is ticked">Reset to defaults</button>
        <label class="check" title="Also reset colour rules, auto-replies, quick-send buttons, send lines, text size and scrollback. Profiles are never deleted here, and port settings stay while connected"><input type="checkbox" bind:checked={all} /> All</label>
      </div>
    </fieldset>
  {/if}
  <fieldset class="about">
    <legend>About</legend>
    <AboutPanel />
  </fieldset>
</div>

<style>
  .row { display: flex; gap: 10px; align-items: center; font-size: 12.5px; }
  .about { flex: 1 1 320px; }
</style>
