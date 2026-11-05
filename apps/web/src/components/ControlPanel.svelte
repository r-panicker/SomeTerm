<script lang="ts">
  import type { Session } from '../lib/session.svelte';
  import type { Workspace } from '../lib/workspace.svelte';
  import { portPanel, type PortTab } from '../lib/panel.svelte';
  import TabbedPanel from './TabbedPanel.svelte';
  import DisplayTab from './tabs/DisplayTab.svelte';
  import PortTabView from './tabs/PortTab.svelte';
  import SendTab from './tabs/SendTab.svelte';
  import PlotTab from './tabs/PlotTab.svelte';
  import AutomationTab from './tabs/AutomationTab.svelte';
  import AppTab from './tabs/AppTab.svelte';
  import CapturePanel from './CapturePanel.svelte';
  import ProfilesPanel from './ProfilesPanel.svelte';

  /** A connection's settings, in tabs the way RealTerm lays them out. */
  let { session, workspace }: { session: Session; workspace: Workspace } = $props();
  const TABS: [PortTab, string][] = [['display', 'Display'], ['port', 'Port'], ['send', 'Send'], ['capture', 'Capture'], ['plot', 'Plot'], ['automation', 'Automation'], ['profiles', 'Profiles'], ['app', 'App']];
</script>

<TabbedPanel tabs={TABS} state={portPanel}>
  {#snippet children(tab: PortTab)}
    {#if tab === 'display'}<DisplayTab source={session} {session} />
    {:else if tab === 'port'}<PortTabView {session} {workspace} />
    {:else if tab === 'send'}<SendTab {session} />
    {:else if tab === 'capture'}
      <div class="capture"><CapturePanel ctl={session.capture} newline={session.newline} meta={() => ({ port: session.portLabel(), options: $state.snapshot(session.options) })} onstart={() => session.recordSignals()} /></div>
    {:else if tab === 'plot'}<PlotTab {session} />
    {:else if tab === 'automation'}<AutomationTab {session} />
    {:else if tab === 'profiles'}<div class="narrow"><ProfilesPanel {session} /></div>
    {:else}<AppTab {session} />{/if}
  {/snippet}
</TabbedPanel>

<style>
  .capture, .narrow { max-width: 560px; }
</style>
