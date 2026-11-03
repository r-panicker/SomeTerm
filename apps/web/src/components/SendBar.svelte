<script lang="ts">
  import { CHECKSUMS, parseEscapes, parseHexBytes, toHex } from '@superserial/core';
  import type { Session } from '../lib/session.svelte';
  import { formatBytes } from '../lib/format';

  let { session }: { session: Session } = $props();

  const HISTORY_MAX = 100;
  let mode = $state<'text' | 'hex'>('text');
  let eol = $state('\\r\\n');
  let input = $state('');
  let error = $state('');
  let optionsOpen = $state(false);
  let history: string[] = [];
  let cursor = -1;
  let field: HTMLInputElement | undefined = $state();
  let fileInput: HTMLInputElement;
  let popover: HTMLDivElement | undefined = $state();
  let optionsButton: HTMLButtonElement | undefined = $state();

  const o = $derived(session.sendOptions);
  const job = $derived(session.job);

  const preview = $derived.by(() => {
    if (mode !== 'hex' || !input.trim()) return '';
    try { return toHex(parseHexBytes(input)); } catch { return ''; }
  });

  /** Only options that change what gets sent are worth a label. */
  const summary = $derived(
    [
      o.checksum !== 'none' && CHECKSUMS.find((c) => c.kind === o.checksum)!.label,
      (o.byteDelayMs || o.lineDelayMs) && 'paced',
      o.rtsWhileSending && 'RTS',
    ].filter(Boolean).join(' · '),
  );
  const sendLabel = $derived(o.repeat === 1 ? 'Send' : o.repeat === 0 ? 'Send ∞' : `Send ×${o.repeat}`);

  export function focus() {
    field?.focus();
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (job) { session.cancelJob(); return; }
    let payload: Uint8Array;
    try {
      payload = mode === 'hex' ? parseHexBytes(input) : parseEscapes(input);
    } catch (err) {
      error = (err as Error).message;
      return;
    }
    const suffix = mode === 'text' ? parseEscapes(eol) : new Uint8Array(0);
    if (input && history[0] !== input) history = [input, ...history].slice(0, HISTORY_MAX);
    cursor = -1;
    const sent = input;
    await session.sendMessage(payload, suffix);
    if (input === sent && o.repeat === 1) input = '';
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    cursor = Math.max(-1, Math.min(history.length - 1, cursor + (e.key === 'ArrowUp' ? 1 : -1)));
    input = cursor < 0 ? '' : history[cursor]!;
  }

  function pickedFile() {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (f) session.sendFile(f);
  }

  function outside(e: MouseEvent) {
    if (optionsOpen && !popover?.contains(e.target as Node) && !optionsButton?.contains(e.target as Node)) optionsOpen = false;
  }

  const num = (v: string, min = 0) => Math.max(min, Math.floor(Number(v) || 0));

  function progressText(j: NonNullable<typeof job>): string {
    if (j.kind === 'repeat') return j.total === 0 ? `Repeating · ${j.done} sent` : `Repeating · ${j.done} / ${j.total}`;
    const pct = j.total ? Math.floor((100 * j.done) / j.total) : 100;
    return `${j.label} · ${formatBytes(j.done)} / ${formatBytes(j.total)} · ${pct}%`;
  }
</script>

<svelte:window onmousedown={outside} />

<form onsubmit={send}>
  <div class="seg" role="group" aria-label="Send as">
    <button type="button" class:on={mode === 'text'} onclick={() => (mode = 'text')}>Text</button>
    <button type="button" class:on={mode === 'hex'} onclick={() => (mode = 'hex')}>Hex</button>
  </div>
  {#if job}
    <div class="progress" role="status">
      {#if job.kind !== 'repeat' || job.total}<div class="bar" style:width="{job.total ? (100 * job.done) / job.total : 0}%"></div>{/if}
      <span>{progressText(job)}</span>
    </div>
  {:else}
    <input
      bind:this={field}
      bind:value={input}
      oninput={() => (error = '')}
      onkeydown={key}
      placeholder={mode === 'hex' ? '0D 0A 41' : 'Text, \\r \\n \\xNN'}
      title={mode === 'hex' ? 'Hex bytes separated by spaces or commas' : 'Escapes: \\r \\n \\t \\0 \\\\ \\xNN. ↑/↓ for history'}
      class:bad={!!error}
      disabled={!session.open}
      spellcheck="false"
      autocomplete="off"
    />
  {/if}
  {#if mode === 'text' && !job}
    <select bind:value={eol} title="Appended to each send, after any checksum">
      <option value={'\\r\\n'}>+CRLF</option><option value={'\\n'}>+LF</option><option value={'\\r'}>+CR</option><option value="">none</option>
    </select>
  {/if}
  <div class="anchor">
    <button type="button" bind:this={optionsButton} class:active={!!summary} onclick={() => (optionsOpen = !optionsOpen)} disabled={!!job} title="Checksum, pacing, repeat">{summary || '⋯'}</button>
    {#if optionsOpen && !job}
      <div class="popover" bind:this={popover}>
        <label>Checksum
          <select bind:value={session.sendOptions.checksum}>
            {#each CHECKSUMS as c}<option value={c.kind} title={c.detail}>{c.label}</option>{/each}
          </select>
        </label>
        <label>Repeat
          <span class="pair">
            <input type="number" min="0" value={o.repeat} oninput={(e) => (session.sendOptions.repeat = num(e.currentTarget.value))} title="Times to send; 0 = until stopped" />
            every
            <input type="number" min="0" value={o.intervalMs} oninput={(e) => (session.sendOptions.intervalMs = num(e.currentTarget.value))} disabled={o.repeat === 1} title="Milliseconds from the start of one send to the next" /> ms
          </span>
        </label>
        <label>Delay
          <span class="pair">
            <input type="number" min="0" value={o.byteDelayMs} oninput={(e) => (session.sendOptions.byteDelayMs = num(e.currentTarget.value))} title="Pause after every byte, ms" /> ms/byte
            <input type="number" min="0" value={o.lineDelayMs} oninput={(e) => (session.sendOptions.lineDelayMs = num(e.currentTarget.value))} title="Pause after every line ending, ms" /> ms/line
          </span>
        </label>
        <label>Half duplex
          <span class="pair">
            <input type="checkbox" bind:checked={session.sendOptions.rtsWhileSending} disabled={!session.capabilities.lineSignals || !session.lineControl} title={session.lineControl ? '' : 'This port has no modem control lines'} />
            raise RTS while sending
          </span>
        </label>
      </div>
    {/if}
  </div>
  <input bind:this={fileInput} type="file" hidden onchange={pickedFile} />
  <button type="button" onclick={() => fileInput.click()} disabled={!session.open || !!job} title="Send a file, using the delay settings">File…</button>
  <button class="primary" disabled={!session.open}>{job ? 'Stop' : sendLabel}</button>
  {#if error}<span class="err">{error}</span>{:else if preview && !job}<span class="preview">{preview}</span>{/if}
</form>

<style>
  form { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: var(--panel); border-top: 1px solid var(--line); }
  input:not([type]) { flex: 1; min-width: 8em; font-family: var(--mono); }
  input.bad { border-color: var(--err); }
  .preview { font: 12px var(--mono); color: var(--muted); }
  .err { font-size: 12px; color: var(--err); }
  .progress { flex: 1; position: relative; height: 26px; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; display: flex; align-items: center; padding: 0 8px; font: 12px var(--mono); }
  .progress .bar { position: absolute; inset: 0 auto 0 0; background: var(--sel); }
  .progress span { position: relative; }
  .anchor { position: relative; }
  .anchor > button.active { color: var(--accent); border-color: var(--accent); font-size: 12px; }
  .popover {
    position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr; gap: 8px 10px;
    align-items: center; padding: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / .18); width: max-content; color: var(--muted);
  }
  .popover label { display: contents; }
  .pair { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .pair input[type='number'] { width: 5.5em; }
</style>
