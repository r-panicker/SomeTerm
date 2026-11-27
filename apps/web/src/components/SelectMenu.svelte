<script lang="ts">
  import { onMount, tick } from 'svelte';

  interface Choice { index: number; value: string; label: string; title: string; disabled: boolean; selected: boolean }
  const id = $props.id();
  let anchor = $state.raw<HTMLSelectElement | null>(null);
  let choices = $state<Choice[]>([]);
  let active = $state(-1);
  let menu: HTMLDivElement | undefined = $state();
  let left = $state(0), top = $state(0), width = $state(0), height = $state(240), font = $state('');
  let label = $state('Options');
  let frame = 0;
  let observer: MutationObserver | undefined;
  let pointerSelect: HTMLSelectElement | null = null;
  let search = '', searchedAt = 0;

  const selectAt = (target: EventTarget | null) => target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 ? target : null;
  const enabled = (select: HTMLSelectElement) => !select.matches(':disabled');

  function close() {
    if (anchor) {
      anchor.setAttribute('aria-expanded', 'false');
      anchor.removeAttribute('aria-controls');
      anchor.removeAttribute('aria-activedescendant');
    }
    anchor = null;
    observer?.disconnect();
    observer = undefined;
    cancelAnimationFrame(frame);
    search = '';
  }

  function refresh() {
    if (!anchor) return;
    const previous = choices[active]?.value;
    choices = Array.from(anchor.options).filter((option) => !option.hidden).map((option) => ({
      index: option.index, value: option.value, label: option.label, title: option.title,
      disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
      selected: option.selected,
    }));
    active = choices.findIndex((option) => option.value === previous && !option.disabled);
    if (active < 0) active = choices.findIndex((option) => option.selected && !option.disabled);
    if (active < 0) active = choices.findIndex((option) => !option.disabled);
  }

  function place() {
    if (!anchor || !anchor.isConnected || !enabled(anchor) || !anchor.getClientRects().length) { close(); return; }
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) { close(); return; }
    const gap = 4, margin = 6;
    width = Math.min(innerWidth - margin * 2, rect.width);
    left = Math.max(margin, Math.min(rect.left, innerWidth - (menu?.offsetWidth ?? width) - margin));
    const below = innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin;
    const desired = Math.min(280, menu?.scrollHeight ?? choices.length * 28 + 8);
    const upwards = below < desired && above > below;
    height = Math.max(28, Math.min(280, upwards ? above : below));
    const actualHeight = Math.min(desired, height);
    top = upwards ? rect.top - gap - actualHeight : rect.bottom + gap;
    frame = requestAnimationFrame(place);
  }

  function open(select: HTMLSelectElement) {
    close();
    if (!enabled(select)) return;
    select.focus({ preventScroll: true });
    anchor = select;
    active = -1;
    refresh();
    font = getComputedStyle(select).font;
    label = select.getAttribute('aria-label') || '';
    if (!label && select.labels?.length) {
      const copy = select.labels[0]!.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('select, input, button').forEach((child) => child.remove());
      label = copy.textContent?.trim() || '';
    }
    label ||= select.title || 'Options';
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', id);
    observer = new MutationObserver(refresh);
    observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'title'] });
    place();
  }

  function move(direction: number, edge = false) {
    let next = edge ? (direction > 0 ? -1 : choices.length) : active;
    for (let i = 0; i < choices.length; i++) {
      next = (next + direction + choices.length) % choices.length;
      if (!choices[next]!.disabled) { active = next; return; }
    }
  }

  function find(text: string) {
    const now = performance.now();
    search = now - searchedAt > 700 ? text : search + text;
    searchedAt = now;
    const prefix = [...search].every((char) => char === search[0]) ? text : search;
    for (let i = 1; i <= choices.length; i++) {
      const next = (active + i) % choices.length;
      if (!choices[next]!.disabled && choices[next]!.label.toLowerCase().startsWith(prefix.toLowerCase())) { active = next; return; }
    }
  }

  function choose(index: number) {
    const select = anchor, choice = choices[index];
    if (!select || !enabled(select) || !choice || choice.disabled) return;
    select.focus({ preventScroll: true });
    const changed = select.selectedIndex !== choice.index;
    close();
    if (!changed) return;
    select.selectedIndex = choice.index;
    // Keep native value bindings, numeric option values and user-gesture pickers intact.
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  $effect(() => {
    const select = anchor, current = active;
    if (!select) return;
    if (current < 0) select.removeAttribute('aria-activedescendant');
    else select.setAttribute('aria-activedescendant', `${id}-${current}`);
    void tick().then(() => { if (anchor === select) document.getElementById(`${id}-${current}`)?.scrollIntoView({ block: 'nearest' }); });
  });

  onMount(() => {
    const pointer = (event: PointerEvent) => {
      const select = selectAt(event.target);
      pointerSelect = select;
      if (select && event.button === 0 && enabled(select)) {
        event.preventDefault();
        if (anchor === select) close(); else open(select);
      } else if (!(event.target instanceof Node && menu?.contains(event.target))) close();
    };
    const mouse = (event: MouseEvent) => { if (selectAt(event.target)) event.preventDefault(); };
    const click = (event: MouseEvent) => {
      const select = selectAt(event.target);
      if (!select) return;
      event.preventDefault();
      if (pointerSelect !== select && enabled(select)) open(select);
      pointerSelect = null;
    };
    const focus = (event: FocusEvent) => { if (anchor && event.target !== anchor && !(event.target instanceof Node && menu?.contains(event.target))) close(); };
    const scroll = (event: Event) => { if (anchor && event.target instanceof Node && event.target.contains(anchor)) close(); };
    const key = (event: KeyboardEvent) => {
      const select = selectAt(event.target);
      if (!select || !enabled(select) || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (event.altKey && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.key === 'Tab') {
        if (anchor === select && active >= 0) choose(active); else close();
        return;
      }
      if (event.key === 'Escape') { if (anchor !== select) return; close(); }
      else if (event.altKey && event.key === 'ArrowUp') close();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', ' ', 'F4'].includes(event.key)) {
        if (anchor !== select) {
          open(select);
          if (event.key === 'Home') move(1, true);
          if (event.key === 'End') move(-1, true);
        } else if (event.key === 'Enter' || event.key === ' ') choose(active);
        else if (event.key === 'F4') close();
        else if (event.key === 'Home') move(1, true);
        else if (event.key === 'End') move(-1, true);
        else {
          const direction = event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 1;
          for (let i = 0; i < (event.key.startsWith('Page') ? 8 : 1); i++) move(direction);
        }
      } else if ([...event.key].length === 1 && !event.altKey) {
        if (anchor !== select) open(select);
        find(event.key);
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('mousedown', mouse, true);
    document.addEventListener('click', click, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', close);
    return () => {
      close();
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('mousedown', mouse, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', close);
    };
  });
</script>

{#if anchor}
  <div bind:this={menu} {id} class="select-menu" role="listbox" aria-label={label} style:left="{left}px" style:top="{top}px" style:min-width="{width}px" style:max-width="calc(100vw - 12px)" style:max-height="{height}px" style:font={font}>
    {#each choices as choice, i (choice.index)}
      <button type="button" id="{id}-{i}" role="option" tabindex="-1" aria-selected={choice.selected} aria-disabled={choice.disabled} disabled={choice.disabled} class:active={active === i} title={choice.title || choice.label} onpointerdown={(event) => event.preventDefault()} onpointermove={() => { if (!choice.disabled) active = i; }} onclick={() => choose(i)}>
        <span class="check" aria-hidden="true">{choice.selected ? '✓' : ''}</span><span>{choice.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .select-menu { position: fixed; z-index: 1000; width: max-content; padding: 3px; overflow: auto; overscroll-behavior: contain; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 5px; box-shadow: 0 4px 14px #0003; }
  button { display: flex; gap: 6px; align-items: center; width: 100%; min-height: 26px; height: auto; border: 0; border-radius: 3px; padding: 4px 7px; background: transparent; color: inherit; text-align: left; white-space: nowrap; font: inherit; line-height: 1.4; }
  button.active { background: var(--accent); color: var(--accent-fg); }
  button:disabled { opacity: .5; }
  .check { width: 1em; flex-shrink: 0; }
  button > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
