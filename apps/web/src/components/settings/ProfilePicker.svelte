<script lang="ts">
  import type { Session } from '../../lib/session.svelte';
  import { profiles, settingsOf } from '../../lib/profiles.svelte';

  /** Rows for a `.form` grid: the connection's profile, saving a new one, updating a changed one. */
  let { session }: { session: Session } = $props();

  const profile = $derived(profiles.get(session.profileId));
  const dirty = $derived(!!profile && JSON.stringify(settingsOf(session)) !== JSON.stringify(profile.settings));
  const device = $derived(session.deviceId());
  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
  const deviceText = $derived(device ? `${hex4(device.vid)}:${hex4(device.pid)}${device.serial ? ` #${device.serial}` : ''}` : '');
  const locked = $derived(session.open ? 'Disconnect to switch profiles' : '');
  let saving = $state(false);
  let newName = $state('');
  let matchDevice = $state(true);

  function pick(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    if (v === '__save') { saving = true; newName = profile?.name ?? ''; }
    else if (v) session.applyProfile(v);
    else session.profileId = null;
    e.currentTarget.value = session.profileId ?? '';
  }

  function saveNew() {
    if (!newName.trim()) return;
    const p = profiles.create(newName, settingsOf(session), matchDevice && device ? device : undefined);
    session.profileId = p.id;
    saving = false;
  }
</script>

<label>Profile
  <span class="pair">
    <select value={session.profileId ?? ''} onchange={pick} title={dirty ? `Changed since ${profile?.name} was applied` : 'Settings saved for a device; one marked for a device applies itself when that device is chosen'}>
      <option value="" disabled={session.open} title={locked}>None</option>
      {#each profiles.list as p (p.id)}<option value={p.id} disabled={session.open} title={locked || (p.match ? 'Applies itself to its device' : '')}>{p.name}</option>{/each}
      <option value="__save">Save as…</option>
    </select>
    {#if dirty}<button type="button" onclick={() => profile && profiles.update(profile.id, settingsOf(session))} title="Save the current settings into {profile?.name}">Update</button>{/if}
  </span>
</label>
{#if saving}
  <label>Name
    <input bind:value={newName} placeholder="e.g. ESP32 DevKit" onkeydown={(e) => e.key === 'Enter' && saveNew()} />
  </label>
  {#if device}
    <span></span>
    <label class="check"><input type="checkbox" bind:checked={matchDevice} /> Apply to {deviceText} automatically</label>
  {/if}
  <span></span>
  <span class="pair"><button type="button" class="primary" onclick={saveNew} disabled={!newName.trim()}>Save</button><button type="button" onclick={() => (saving = false)}>Cancel</button></span>
{/if}

<style>
  .check { display: flex !important; gap: 6px; align-items: center; color: var(--fg); font-size: 12px; }
</style>
