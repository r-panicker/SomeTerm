import { compileRules, type ColorRule, type CompiledRule } from '@superserial/core';

const STORAGE_KEY = 'superserial.rules.v1';

export const RULE_COLOR_NAMES = ['Red', 'Amber', 'Green', 'Blue', 'Purple', 'Cyan', 'Pink', 'Grey'];
// Text colours for match rules, tuned per theme like the ANSI palette.
const TEXT_LIGHT = ['#c4291c', '#a15c00', '#1a7f37', '#1f5fd6', '#7c3aed', '#0b7a8a', '#c2255c', '#6b6b73'];
const TEXT_DARK = ['#ff6b5e', '#fbbf24', '#4ade80', '#60a5fa', '#c4b5fd', '#22d3ee', '#f472b6', '#a1a1aa'];
const TINT = ['239,68,68', '245,158,11', '34,197,94', '59,130,246', '139,92,246', '6,182,212', '236,72,153', '161,161,170'];

export function ruleText(color: number, dark: boolean): string {
  return (dark ? TEXT_DARK : TEXT_LIGHT)[color % 8]!;
}

/** Translucent so ANSI text colours stay readable on a tinted line. */
export function ruleTint(color: number, dark: boolean): string {
  return `rgba(${TINT[color % 8]},${dark ? 0.26 : 0.16})`;
}

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function valid(r: unknown): r is ColorRule {
  const x = r as ColorRule;
  return !!x && typeof x.pattern === 'string' && (x.mode === 'line' || x.mode === 'match') && Number.isInteger(x.color);
}

/** One rule list for every tab and the Monitor. */
class RuleStore {
  list = $state<ColorRule[]>([]);
  /** Bumped on every change so terminals redraw. */
  version = $state(0);
  compiled = $derived<CompiledRule[]>(compileRules(this.list));

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[];
      this.list = raw.filter(valid).map((r) => ({ ...r, id: r.id || newId(), caseSensitive: !!r.caseSensitive, regex: !!r.regex, color: Math.abs(r.color) % 8 }));
    } catch {
      this.list = [];
    }
  }

  add(r: Omit<ColorRule, 'id' | 'color'> & { color?: number }): ColorRule {
    const rule: ColorRule = { id: newId(), color: r.color ?? this.nextColor(), ...r } as ColorRule;
    this.list.push(rule);
    this.changed();
    return rule;
  }

  update(id: string, patch: Partial<ColorRule>): void {
    const r = this.list.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    this.changed();
  }

  clear(): void {
    this.list = [];
    this.changed();
  }

  remove(id: string): void {
    this.list = this.list.filter((r) => r.id !== id);
    this.changed();
  }

  move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.list.length || to >= this.list.length) return;
    const [r] = this.list.splice(from, 1);
    this.list.splice(to, 0, r!);
    this.changed();
  }

  /** A starting point; skips patterns that already exist. */
  addCommon(): void {
    const common: Omit<ColorRule, 'id'>[] = [
      { pattern: '\\b(error|fail(ed|ure)?|fault)\\b', caseSensitive: false, regex: true, mode: 'match', color: 0 },
      { pattern: '\\bwarn(ing)?\\b', caseSensitive: false, regex: true, mode: 'match', color: 1 },
      { pattern: '\\b(ok|pass(ed)?|success)\\b', caseSensitive: false, regex: true, mode: 'match', color: 2 },
    ];
    for (const c of common) if (!this.list.some((r) => r.pattern === c.pattern)) this.list.push({ id: newId(), ...c });
    this.changed();
  }

  private nextColor(): number {
    const used = new Set(this.list.map((r) => r.color));
    for (let c = 0; c < 8; c++) if (!used.has(c)) return c;
    return this.list.length % 8;
  }

  private changed(): void {
    this.version++;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.list)));
    } catch {
      /* storage unavailable; rules last for this session only */
    }
  }
}

export const rules = new RuleStore();
