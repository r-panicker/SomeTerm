/**
 * Which tab of the control panel under the terminal is showing, and whether the
 * panel is open. Shared so that the status-bar summary, Plot view, REC and similar can
 * bring their tab forward; remembered across launches.
 */
class PanelState<T extends string> {
  tab = $state<T>('' as T);
  open = $state(true);

  constructor(private readonly key: string, readonly first: T, private readonly ids: readonly T[]) {
    this.tab = first;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { tab?: T; open?: boolean } | null;
      if (saved?.tab && ids.includes(saved.tab)) this.tab = saved.tab;
      if (typeof saved?.open === 'boolean') this.open = saved.open;
    } catch { /* storage unavailable: defaults */ }
  }

  /** Bring a tab forward, opening the panel. */
  show(tab: T): void {
    this.tab = tab;
    this.open = true;
    this.save();
  }

  /** Clicking the tab that is already showing folds the panel away, and back. */
  click(tab: T): void {
    if (tab === this.tab) this.open = !this.open;
    else { this.tab = tab; this.open = true; }
    this.save();
  }

  private save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ tab: this.tab, open: this.open })); } catch { /* not persisted */ }
  }
}

export const PORT_TABS = ['display', 'port', 'send', 'capture', 'plot', 'automation', 'profiles', 'app'] as const;
export type PortTab = (typeof PORT_TABS)[number];
export const portPanel = new PanelState<PortTab>('someterm.panel.v1', 'display', PORT_TABS);

export const MONITOR_TABS = ['display', 'capture', 'automation', 'app'] as const;
export type MonitorTab = (typeof MONITOR_TABS)[number];
export const monitorPanel = new PanelState<MonitorTab>('someterm.monitorPanel.v1', 'display', MONITOR_TABS);
