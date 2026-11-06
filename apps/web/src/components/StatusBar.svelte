<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import { formatBytes as bytes } from '../lib/format';
  import { profiles, settingsOf } from '../lib/profiles.svelte';

  /** `onport` brings the Port tab forward; the summary is its read-only state. */
  let { session, onCapture, onport }: { session: Session; onCapture: () => void; onport: () => void } = $props();

  const PARITY = { none: 'N', even: 'E', odd: 'O', mark: 'M', space: 'S' } as const;
  const FLOW = { none: '', rtscts: 'RTS/CTS', dsrdtr: 'DSR/DTR', xonxoff: 'XON/XOFF' } as const;
  const o = $derived(session.options);
  const profile = $derived(profiles.get(session.profileId));
  const dirty = $derived(!!profile && JSON.stringify(settingsOf(session)) !== JSON.stringify(profile.settings));
  /** A network connection has no baud or framing; its name is already on the top bar. */
  const framing = $derived(session.choice.kind === 'net' ? '' : `${o.baudRate} ${o.dataBits}${PARITY[o.parity]}${o.stopBits}${FLOW[o.flowControl] ? ' ' + FLOW[o.flowControl] : ''}`);

  const SIGNALS = [['cts', 'CTS'], ['dsr', 'DSR'], ['dcd', 'DCD'], ['ri', 'RI']] as const;
  const traffic = $derived(session.open || session.rx > 0 || session.tx > 0);
</script>

<footer>
  {#if framing || profile || session.forwardTo}
    <button class="chip" onclick={onport} title="{profile ? `Profile ${profile.name}${dirty ? ', changed since applied: Update on the Port tab saves it' : ''}. ` : ''}Settings on the Port tab">
      {#if profile}<span class="pname">{profile.name}</span>{#if framing}<span class="sep">·</span>{/if}{/if}{framing}{#if session.forwardTo}<span class="sep">{session.forwardTo.forwardTo === session ? '⇄' : '→'}{session.forwardTo.letter}</span>{/if}{#if dirty}<span class="dirty">•</span>{/if}
    </button>
  {/if}
  {#if session.signals}
    {#each SIGNALS.filter(([k]) => k !== 'ri' || session.capabilities.ringIndicator) as [k, l]}
      <span class="sig" class:on={session.signals[k]} title="{l} input">{l}</span>
    {/each}
  {/if}
  <span class="spacer"></span>
  {#if session.errors}
    <button class="errs" onclick={() => { session.errors = 0; session.lastError = ''; }} title="{session.lastError} (click to reset)">⚠ {session.errors} {session.lastError}</button>
  {/if}
  {#if session.capture.info}
    {@const c = session.capture.info}
    <button class="cap" class:rec={c.state === 'running'} onclick={onCapture} title="Capture: {c.name}">
      {c.state === 'running' ? '● REC' : c.state === 'armed' ? '◌ ARMED' : c.state === 'paused' ? '❚❚ REC' : c.kind === 'memory' ? 'Capture' : 'Saved'} {bytes(c.captured)}
    </button>
  {/if}
  {#if traffic}
    <span title="Received">↓ {bytes(session.rx)}{session.open ? ` · ${bytes(Math.round(session.rate))}/s` : ''}</span>
    <span title="Sent">↑ {bytes(session.tx)}</span>
  {/if}
</footer>

<style>
  .chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; white-space: nowrap; color: var(--fg); }
  .chip:hover { color: var(--accent); }
  .pname { font-family: system-ui, sans-serif; overflow: hidden; text-overflow: ellipsis; max-width: 16ch; }
  .sep { margin: 0 .4em; color: var(--muted); }
  .dirty { margin-left: .3em; color: var(--accent); }
  footer { display: flex; gap: 10px; align-items: center; padding: 2px 8px; font: 11.5px var(--mono); color: var(--muted); background: var(--panel); border-top: 1px solid var(--line); min-height: 22px; }
  .sig::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; background: var(--line); vertical-align: 0; }
  .sig.on { color: var(--fg); }
  .sig.on::before { background: var(--ok); }
  .cap { all: unset; cursor: pointer; }
  .cap.rec { color: var(--err); }
  .errs { all: unset; cursor: pointer; color: var(--err); max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
