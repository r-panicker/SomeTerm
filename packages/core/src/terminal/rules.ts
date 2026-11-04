import { buildMatcher, type Matcher } from './search';

export interface ColorRule {
  id: string;
  pattern: string;
  caseSensitive: boolean;
  regex: boolean;
  /** line: tint the whole line; match: colour just the matched text. */
  mode: 'line' | 'match';
  /** Index into the rule palette. */
  color: number;
}

export interface CompiledRule {
  rule: ColorRule;
  /** Null for an empty or invalid pattern, which then matches nothing. */
  match: Matcher | null;
  error: string;
}

export function compileRules(rules: readonly ColorRule[]): CompiledRule[] {
  return rules.map((rule) => {
    const m = buildMatcher(rule.pattern, { caseSensitive: rule.caseSensitive, regex: rule.regex });
    return typeof m === 'string' ? { rule, match: null, error: m } : { rule, match: m, error: '' };
  });
}

export interface RuleRun {
  from: number;
  to: number;
  color: number;
}

export interface RuleResult {
  /** Colour of the first line rule that matches, if any. */
  line?: number;
  /** Non-overlapping coloured ranges from match rules, in order. */
  runs: RuleRun[];
}

/** Earlier rules win: a line tint comes from the first matching line rule, and each character takes the first match rule covering it. */
export function applyRules(rules: readonly CompiledRule[], text: string): RuleResult {
  let line: number | undefined;
  let owner: Int16Array | null = null;
  for (const { rule, match } of rules) {
    if (!match) continue;
    if (rule.mode === 'line') {
      if (line === undefined && match(text).length) line = rule.color;
      continue;
    }
    for (const [a, b] of match(text)) {
      owner ??= new Int16Array(text.length).fill(-1);
      for (let i = a; i < b; i++) if (owner[i] === -1) owner[i] = rule.color;
    }
  }
  const runs: RuleRun[] = [];
  if (owner) {
    for (let i = 0; i < owner.length; ) {
      const c = owner[i]!;
      let j = i + 1;
      while (j < owner.length && owner[j] === c) j++;
      if (c >= 0) runs.push({ from: i, to: j, color: c });
      i = j;
    }
  }
  return line === undefined ? { runs } : { line, runs };
}
