const STORAGE_KEY = 'superserial.textSize.v1';
const SCROLLBACK_KEY = 'superserial.scrollback.v1';
const THEME_KEY = 'superserial.theme.v1';

export type Theme = 'system' | 'light' | 'dark';

/** Lines kept per terminal; the default comes second. */
export const SCROLLBACK = [10_000, 100_000, 500_000] as const;

/** Terminal text sizes in CSS px; the default comes first. */
export const TEXT_SIZES = [12.5, 14, 16, 18, 21, 24, 28, 34] as const;

/** App-wide preferences that are not part of a tab or profile. */
class Prefs {
  textSize = $state<number>(TEXT_SIZES[0]);
  scrollback = $state<number>(SCROLLBACK[1]);
  theme = $state<Theme>('system');
  private systemDark = $state(false);

  /** Whether the dark palette is showing, for drawing code that cannot use CSS (canvas, plot, xterm). */
  get dark(): boolean {
    return this.theme === 'dark' || (this.theme === 'system' && this.systemDark);
  }

  constructor() {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      if ((TEXT_SIZES as readonly number[]).includes(v)) this.textSize = v;
      const t = localStorage.getItem(THEME_KEY);
      if (t === 'light' || t === 'dark') this.theme = t;
      const n = Number(localStorage.getItem(SCROLLBACK_KEY));
      if ((SCROLLBACK as readonly number[]).includes(n)) this.scrollback = n;
    } catch { /* storage unavailable: keep the default */ }
    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      this.systemDark = mq.matches;
      mq.addEventListener('change', () => { this.systemDark = mq.matches; });
    }
    this.applyTheme();
  }

  setTextSize(v: number): void {
    this.textSize = v;
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* not persisted */ }
  }

  /** The CSS palette follows the `data-theme` attribute; "system" removes it so the media query decides. */
  setTheme(t: Theme): void {
    this.theme = t;
    this.applyTheme();
    try { localStorage.setItem(THEME_KEY, t); } catch { /* not persisted */ }
  }

  private applyTheme(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (this.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = this.theme;
    root.style.colorScheme = this.theme === 'system' ? 'light dark' : this.theme;
  }

  setScrollback(n: number): void {
    this.scrollback = n;
    try { localStorage.setItem(SCROLLBACK_KEY, String(n)); } catch { /* not persisted */ }
  }

  /** One step larger (+1) or smaller (-1), staying within the list. */
  stepTextSize(dir: 1 | -1): void {
    const i = TEXT_SIZES.indexOf(this.textSize as (typeof TEXT_SIZES)[number]);
    const next = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, (i < 0 ? 0 : i) + dir))]!;
    if (next !== this.textSize) this.setTextSize(next);
  }
}

export const prefs = new Prefs();
