<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import AutoReplyPanel from '../AutoReplyPanel.svelte';
  import RulesPanel from '../RulesPanel.svelte';

  /** `session` is absent for the Monitor, which only has colour rules. */
  let { session }: { session?: Session } = $props();
</script>

<div class="groups">
  {#if session}
    <fieldset class="grow">
      <legend>Auto-replies</legend>
      <AutoReplyPanel {session} />
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
