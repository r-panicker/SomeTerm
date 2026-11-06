<script lang="ts">
  import type { CaptureFormat, CaptureOptions, CaptureSource, NewlineMode } from '@someterm/core';
  import type { CaptureController } from '../lib/capture.svelte';
  import { canPickFolder, canSaveToFile } from '../lib/sinks';
  import { formatBytes } from '../lib/format';

  /** `fixed` hides Data and Format for sources that decide them, such as the Monitor. */
  let { ctl, newline = 'auto', fixed = false, meta, onstart }: { ctl: CaptureController; newline?: NewlineMode; fixed?: boolean; meta?: () => CaptureOptions['meta']; onstart?: () => void } = $props();

  const fileOk = canSaveToFile();
  let dest = $state<'file' | 'memory'>(fileOk ? 'file' : 'memory');
  let append = $state(false);
  let source = $state<CaptureSource>('rx');
  let format = $state<CaptureFormat>('text');
  let maxBytes = $state('');
  let maxSeconds = $state('');
  let splitMb = $state('');
  let splitMin = $state('');
  let startBytes = $state('');
  let startText = $state('');
  const folderOk = canPickFolder();
  const recording = $derived(!fixed && format === 'session');
  const splitting = $derived(dest === 'file' && folderOk && !recording && !!(positive(splitMb) || positive(splitMin)));
  let now = $state(Date.now());

  const c = $derived(ctl.info);
  const active = $derived(!!c && c.state !== 'stopped');

  $effect(() => {
    if (!active) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });

  function positive(s: string): number | undefined {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function elapsed(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function start() {
    ctl.discard();
    const o = fixed ? { source: 'rx' as const, format: 'raw' as const } : { source, format, newline, ...(recording && { meta: meta?.() }) };
    const mb = positive(splitMb);
    const min = positive(splitMin);
    const rotate = splitting ? { bytes: mb && Math.round(mb * 1024 * 1024), seconds: min && min * 60 } : undefined;
    const trigger = startText.trim() ? { startOnText: startText } : positive(startBytes) ? { startAfterBytes: positive(startBytes) } : {};
    ctl.start({ ...o, ...trigger, maxBytes: positive(maxBytes), maxSeconds: positive(maxSeconds) }, dest, append, rotate).then((ok) => ok && onstart?.());
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

<div class="groups">
  <fieldset>
    <legend>Save to</legend>
    <div class="form">
      <span>Into</span>
      <div class="seg">
        <button class:on={dest === 'file'} onclick={() => (dest = 'file')} disabled={!fileOk || active} title={fileOk ? 'Stream to a file as data arrives' : 'This browser cannot write files directly'}>File</button>
        <button class:on={dest === 'memory'} onclick={() => (dest = 'memory')} disabled={active} title="Hold in memory; view or download after stopping">Memory</button>
      </div>
      {#if dest === 'file' && !splitting}
        <span>File</span>
        <div class="seg">
          <button class:on={!append} onclick={() => (append = false)} disabled={active}>Overwrite</button>
          <button class:on={append} onclick={() => (append = true)} disabled={active}>Append</button>
        </div>
      {/if}
      {#if dest === 'file' && folderOk && !recording}
        <span>Split every</span>
        <div class="limits">
          <input bind:value={splitMb} inputmode="decimal" placeholder="–" disabled={active} title="Start a new file after this many megabytes" /> MB
          <input bind:value={splitMin} inputmode="decimal" placeholder="–" disabled={active} title="Start a new file after this many minutes" /> min
        </div>
      {/if}
    </div>
  </fieldset>

  <fieldset>
    <legend>What and when</legend>
    <div class="form">
      {#if !fixed}
        {#if !recording}
          <span>Data</span>
          <div class="seg">
            {#each [['rx', 'Received'], ['tx', 'Sent'], ['both', 'Both']] as [v, l]}
              <button class:on={source === v} onclick={() => (source = v as CaptureSource)} disabled={active} title={v === 'both' ? 'Both directions, sent data tagged' : undefined}>{l}</button>
            {/each}
          </div>
        {/if}
        <span>Format</span>
        <select bind:value={format} disabled={active} title={recording ? 'Both directions and the line signals, with timing; replay it with Recording… in the connection type list' : undefined}>
          <option value="text">Text, timestamped lines</option>
          <option value="raw">Raw bytes</option>
          <option value="hex">Hex, timestamped chunks</option>
          <option value="session">Session recording, replayable (.strec)</option>
        </select>
      {/if}
      <span>Start after</span>
      <div class="limits">
        <input bind:value={startBytes} inputmode="numeric" placeholder="–" disabled={active || !!startText.trim()} title="Begin capturing after this many data bytes" /> bytes
        <input class="text" bind:value={startText} placeholder="or text" disabled={active || !!startBytes.trim()} title="Begin where this text first appears (included). Escapes like \r \n \xNN work" />
      </div>
      <span>Stop after</span>
      <div class="limits">
        <input bind:value={maxBytes} inputmode="numeric" placeholder="∞" disabled={active} title="Stop after this many data bytes" /> bytes
        <input bind:value={maxSeconds} inputmode="numeric" placeholder="∞" disabled={active} title="Stop after this many seconds" /> s
      </div>
    </div>
  </fieldset>

  <fieldset class="run">
    <legend>Capture</legend>
    <div class="actions">
      {#if active && c}
        <button onclick={() => (c.state === 'paused' ? ctl.resume() : ctl.pause())}>{c.state === 'paused' ? 'Resume' : 'Pause'}</button>
        <button class="primary" onclick={() => ctl.stop()}>Stop</button>
      {:else}
        <button class="primary" onclick={start} title={splitting ? 'Choose a folder; files are numbered -001, -002, …' : ''}>{splitting ? 'Choose folder…' : 'Start capture'}</button>
      {/if}
    </div>
    {#if c}
      <div class="status" class:rec={c.state === 'running'}>
        <div class="name" title={c.name}>{c.name}</div>
        <div>
          {formatBytes(c.captured)}{c.files ? ` · ${c.files} ${c.files === 1 ? 'file' : 'files'}` : ''}
          {#if c.state === 'armed'}· armed, waiting for {startText.trim() ? `“${startText}”` : `${startBytes} bytes`}{:else if active}· {elapsed(now - c.startedAt)}{c.state === 'paused' ? ' · paused' : ''}{:else if c.reason !== 'stopped'}· {c.reason}{/if}
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
  </fieldset>
</div>

<style>
  .seg { display: flex; }
  .seg button { flex: 1; }
  .limits { display: flex; align-items: center; gap: 4px; }
  .limits input { width: 5em; min-width: 0; }
  .limits input.text { width: 7em; font-family: var(--mono); }
  .run { flex: 1 1 130px; max-width: 360px; }
  .actions { display: flex; gap: 6px; }
  .status { margin-top: 8px; font: 12px var(--mono); color: var(--muted); }
  .status .name { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status.rec .name::before { content: '● '; color: var(--err); }
  .status .actions { margin-top: 6px; }
</style>
