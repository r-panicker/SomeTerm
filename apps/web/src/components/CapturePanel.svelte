<script lang="ts">
  import type { CaptureFormat, CaptureSource, NewlineMode } from '@superserial/core';
  import type { CaptureController } from '../lib/capture.svelte';
  import { canSaveToFile } from '../lib/sinks';
  import { formatBytes } from '../lib/format';

  /** `fixed` hides Data and Format for sources that decide them, such as the Monitor. */
  let { ctl, newline = 'auto', fixed = false }: { ctl: CaptureController; newline?: NewlineMode; fixed?: boolean } = $props();

  const fileOk = canSaveToFile();
  let dest = $state<'file' | 'memory'>(fileOk ? 'file' : 'memory');
  let append = $state(false);
  let source = $state<CaptureSource>('rx');
  let format = $state<CaptureFormat>('text');
  let maxBytes = $state('');
  let maxSeconds = $state('');
  let now = $state(Date.now());

  const c = $derived(ctl.info);
  const active = $derived(!!c && c.state !== 'stopped');

  $effect(() => {
    if (!active) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });

  const positive = (s: string) => {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  };

  function elapsed(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function start() {
    ctl.discard();
    const o = fixed ? { source: 'rx' as const, format: 'raw' as const } : { source, format, newline };
    ctl.start({ ...o, maxBytes: positive(maxBytes), maxSeconds: positive(maxSeconds) }, dest, append);
  }

  function open(download: boolean) {
    const blob = ctl.blob();
    if (!blob || !c) return;
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = c.name;
      a.click();
    } else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
</script>

<div class="grid" class:locked={active}>
  <span>Save to</span>
  <div class="seg">
    <button class:on={dest === 'file'} onclick={() => (dest = 'file')} disabled={!fileOk || active} title={fileOk ? 'Stream to a file as data arrives' : 'This browser cannot write files directly'}>File</button>
    <button class:on={dest === 'memory'} onclick={() => (dest = 'memory')} disabled={active} title="Hold in memory; view or download after stopping">Memory</button>
  </div>
  {#if dest === 'file'}
    <span>File</span>
    <div class="seg">
      <button class:on={!append} onclick={() => (append = false)} disabled={active}>Overwrite</button>
      <button class:on={append} onclick={() => (append = true)} disabled={active}>Append</button>
    </div>
  {/if}
  {#if !fixed}
  <span>Data</span>
  <div class="seg">
    {#each [['rx', 'Received'], ['tx', 'Sent'], ['both', 'Both']] as [v, l]}
      <button class:on={source === v} onclick={() => (source = v as CaptureSource)} disabled={active}>{l}</button>
    {/each}
  </div>
  <span>Format</span>
  <select bind:value={format} disabled={active}>
    <option value="text">Text, timestamped lines</option>
    <option value="raw">Raw bytes</option>
    <option value="hex">Hex, timestamped chunks</option>
  </select>
  {/if}
  <span>Stop after</span>
  <div class="limits">
    <input bind:value={maxBytes} inputmode="numeric" placeholder="∞" disabled={active} title="Stop after this many data bytes" /> bytes
    <input bind:value={maxSeconds} inputmode="numeric" placeholder="∞" disabled={active} title="Stop after this many seconds" /> s
  </div>
</div>

<div class="actions">
  {#if active && c}
    <button onclick={() => (c.state === 'paused' ? ctl.resume() : ctl.pause())}>{c.state === 'paused' ? 'Resume' : 'Pause'}</button>
    <button class="primary" onclick={() => ctl.stop()}>Stop</button>
  {:else}
    <button class="primary" onclick={start}>Start capture</button>
  {/if}
</div>

{#if c}
  <div class="status" class:rec={c.state === 'running'}>
    <div class="name" title={c.name}>{c.name}</div>
    <div>
      {formatBytes(c.captured)}
      {#if active}· {elapsed(now - c.startedAt)}{c.state === 'paused' ? ' · paused' : ''}{:else if c.reason !== 'stopped'}· {c.reason}{/if}
    </div>
    {#if c.state === 'stopped' && c.kind === 'memory'}
      <div class="actions">
        <button onclick={() => open(false)}>View</button>
        <button onclick={() => open(true)}>Download</button>
        <button onclick={() => ctl.discard()}>Discard</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px; align-items: center; }
  .grid > span { color: var(--muted); }
  .seg button { flex: 1; }
  .limits { display: flex; align-items: center; gap: 4px; color: var(--muted); }
  .limits input { width: 6.5em; min-width: 0; }
  .actions { display: flex; gap: 6px; margin-top: 12px; }
  .status { margin-top: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; font: 12px var(--mono); color: var(--muted); }
  .status .name { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status.rec .name::before { content: '● '; color: var(--err); }
  .status .actions { margin-top: 8px; }
</style>
