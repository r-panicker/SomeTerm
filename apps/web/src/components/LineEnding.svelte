<script lang="ts">
  let { eol = $bindable(), label, disabled = false }: { eol: string; label: string; disabled?: boolean } = $props();
  const cr = $derived(eol.includes('\\r'));
  const lf = $derived(eol.includes('\\n'));
</script>

<span class="ending" role="group" aria-label={label}>
  <label title="Append carriage return (0x0D) to ASCII sends"><input type="checkbox" checked={cr} {disabled} aria-label="{label}: append CR" onchange={(e) => (eol = `${e.currentTarget.checked ? '\\r' : ''}${lf ? '\\n' : ''}`)} /> +CR</label>
  <label title="Append line feed (0x0A) to ASCII sends"><input type="checkbox" checked={lf} {disabled} aria-label="{label}: append LF" onchange={(e) => (eol = `${cr ? '\\r' : ''}${e.currentTarget.checked ? '\\n' : ''}`)} /> +LF</label>
</span>

<style>
  .ending, label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .ending { gap: 8px; font-size: 12px; }
  label { cursor: pointer; }
</style>
