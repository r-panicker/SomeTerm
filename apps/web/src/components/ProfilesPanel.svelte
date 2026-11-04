<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import { profiles } from '../lib/profiles.svelte';

  let { session }: { session: Session } = $props();
  let fileInput: HTMLInputElement;
  let message = $state('');
  let failed = $state(false);

  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

  function download(text: string, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const fileName = (name: string) => `${name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'profile'}.superserial.json`;

  async function imported() {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const { added, skipped } = profiles.importText(await f.text());
      failed = false;
      message = `Imported ${added}${skipped ? `, skipped ${skipped} invalid` : ''}`;
    } catch (e) {
      failed = true;
      message = (e as Error).message;
    }
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete profile “${name}”?`)) return;
    profiles.remove(id);
    if (session.profileId === id) session.profileId = null;
  }
</script>

<div class="actions">
  <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={imported} />
  <button onclick={() => fileInput.click()} title="Add profiles from a .superserial.json file">Import…</button>
  <button onclick={() => download(profiles.exportText(), 'profiles.superserial.json')} disabled={!profiles.list.length} title="Save every profile to one file">Export all</button>
</div>
{#if message}<p class="msg" class:bad={failed}>{message}</p>{/if}

{#each profiles.list as p (p.id)}
  <div class="item" class:current={session.profileId === p.id}>
    <input class="name" value={p.name} onchange={(e) => profiles.rename(p.id, e.currentTarget.value)} aria-label="Profile name" />
    <div class="meta">
      {p.settings.options.baudRate} {p.settings.options.dataBits}{p.settings.options.parity[0]!.toUpperCase()}{p.settings.options.stopBits}
      {#if p.match}· {hex4(p.match.vid)}:{hex4(p.match.pid)}{p.match.serial ? ` #${p.match.serial}` : ''}{/if}
    </div>
    <div class="row">
      {#if p.match}<button onclick={() => profiles.forgetDevice(p.id)} title="Stop applying this profile automatically">Forget device</button>{/if}
      <button onclick={() => download(profiles.exportText([p.id]), fileName(p.name))}>Export</button>
      <button onclick={() => remove(p.id, p.name)}>Delete</button>
    </div>
  </div>
{:else}
  <p class="empty">None yet: choose Profile → Save as… above.</p>
{/each}

<style>
  .actions { display: flex; gap: 6px; margin-bottom: 10px; }
  .msg { font-size: 12px; color: var(--muted); margin: 0 0 10px; }
  .msg.bad { color: var(--err); }
  .item { border: 1px solid var(--line); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
  .item.current { border-color: var(--accent); }
  .name { width: 100%; font-weight: 600; }
  .meta { font: 12px var(--mono); color: var(--muted); margin: 6px 0; }
  .row { display: flex; gap: 6px; }
  .row button { height: 23px; font-size: 12px; }
  .empty { color: var(--muted); font-size: 12px; }
</style>
