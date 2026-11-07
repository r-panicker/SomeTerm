<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import AutoReplyPanel from '../AutoReplyPanel.svelte';
  import QuickSendPanel from '../QuickSendPanel.svelte';
  import RulesPanel from '../RulesPanel.svelte';

  /** `session` is absent for the Monitor, which only has colour rules. */
  let { session }: { session?: Session } = $props();
  const xterm = $derived(!!session && session.display.format === 'screen' && session.view !== 'plot');
</script>

<div class="groups">
  {#if session}
    <fieldset class="grow">
      <legend>Auto-replies</legend>
      <AutoReplyPanel {session} />
    </fieldset>
    <fieldset class="grow" disabled={xterm} title={xterm ? 'Not available in xterm mode, where keys go straight to the device' : undefined}>
      <legend>Quick-send buttons <span class="hint">Alt+1…9</span></legend>
      <QuickSendPanel {session} />
    </fieldset>
  {/if}
  <fieldset class="grow">
    <legend>Colour rules <span class="hint">all connections</span></legend>
    <RulesPanel />
  </fieldset>
</div>

<style>
  .grow { flex: 1 1 340px; }
  .hint { font-weight: 400; }
</style>
