<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import type { Workspace } from '../../lib/workspace.svelte';
  import PortSettings from '../settings/PortSettings.svelte';
  import NetSettings from '../settings/NetSettings.svelte';
  import ProfilePicker from '../settings/ProfilePicker.svelte';

  let { session, workspace }: { session: Session; workspace: Workspace } = $props();
  const isNet = $derived(session.choice.kind === 'net');
  const others = $derived(workspace.sessions.filter((o) => o !== session));
  const canBreak = $derived(session.open && session.capabilities.sendBreak && !session.player);

  /** `fwd:B` sends what this tab receives out of B; `bridge:B` does that both ways. */
  const link = $derived(session.forwardTo ? `${session.forwardTo.forwardTo === session ? 'bridge' : 'fwd'}:${session.forwardTo.letter}` : '');

  function setLink(v: string) {
    const old = session.forwardTo;
    if (old && old.forwardTo === session) old.forwardTo = null;
    const [kind, letter] = v.split(':');
    const to = others.find((o) => o.letter === letter) ?? null;
    session.forwardTo = to;
    if (to && kind === 'bridge') {
      // A tab can forward to only one other; bridging takes over B's forwarding.
      to.forwardTo = session;
    }
  }
</script>

<div class="groups">
  <fieldset>
    <legend>{isNet ? 'Network' : 'Serial port'}</legend>
    <div class="form">
      {#if isNet}<NetSettings {session} />{:else}<PortSettings {session} />{/if}
    </div>
  </fieldset>

  <fieldset>
    <legend>Profile</legend>
    <div class="form"><ProfilePicker {session} /></div>
  </fieldset>

  {#if canBreak || others.length}
    <fieldset>
      <legend>Link</legend>
      <div class="form">
        {#if canBreak}
          <span>Break</span>
          <button class="action" onclick={() => session.sendBreak()} title="Hold the line in the break state for 250 ms">Send 250 ms break</button>
        {/if}
        {#if others.length}
          <label>Connect to tab
            <select class="fwd" value={link} onchange={(e) => setLink(e.currentTarget.value)} title="Forward: what this tab receives is sent out of the other. Bridge: both ways, e.g. a serial port and a TCP server">
              <option value="">none</option>
              {#each others as o (o.id)}
                <option value="fwd:{o.letter}">→ {o.letter} forward ({o.portLabel()})</option>
                <option value="bridge:{o.letter}">⇄ {o.letter} bridge ({o.portLabel()})</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    </fieldset>
  {/if}
</div>
