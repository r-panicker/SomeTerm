const STORAGE_KEY = 'superserial.textSize.v1';

/** Terminal text sizes in CSS px; the default comes first. */
export const TEXT_SIZES = [12.5, 14, 16, 18, 21, 24, 28, 34] as const;

/** App-wide preferences that are not part of a tab or profile. */
class Prefs {
  textSize = $state<number>(TEXT_SIZES[0]);

  constructor() {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      if ((TEXT_SIZES as readonly number[]).includes(v)) this.textSize = v;
    } catch { /* storage unavailable: keep the default */ }
  }

  setTextSize(v: number): void {
    this.textSize = v;
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* not persisted */ }
  }

  /** One step larger (+1) or smaller (-1), staying within the list. */
  stepTextSize(dir: 1 | -1): void {
    const i = TEXT_SIZES.indexOf(this.textSize as (typeof TEXT_SIZES)[number]);
    const next = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, (i < 0 ? 0 : i) + dir))]!;
    if (next !== this.textSize) this.setTextSize(next);
  }
}

export const prefs = new Prefs();
