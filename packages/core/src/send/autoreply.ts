import { buildMatcher } from '../terminal/search';
import { parseEscapes } from './escapes';

export interface AutoReply {
  id: string;
  enabled: boolean;
  pattern: string;
  caseSensitive: boolean;
  regex: boolean;
  /** Send-box escapes allowed; with regex, $1…$9 insert the match's groups ($0 the whole match). */
  reply: string;
  delayMs: number;
}

export interface ReplyAction {
  rule: AutoReply;
  bytes: Uint8Array;
}

export interface ReplyResult {
  send: ReplyAction[];
  /** Rules that fired too often and were switched off (likely a reply loop). */
  disabled: AutoReply[];
  /** Rules whose reply could not be built (bad escape), with the reason. */
  errors: { rule: AutoReply; message: string }[];
}

const MAX_PER_SECOND = 10;

/**
 * Decides which auto-replies a received line triggers. A rule fires at most once
 * per line: a prompt with no newline yet ("Password:") is checked as a partial
 * line and is not answered again when the line completes.
 */
export class AutoReplier {
  private rules: AutoReply[] = [];
  private firedAt = new Map<string, number>();
  private recent = new Map<string, number[]>();

  constructor(private readonly now: () => number) {}

  setRules(rules: readonly AutoReply[]): void {
    this.rules = rules.map((r) => ({ ...r }));
  }

  /** `offset` identifies the line (its stream offset); `text` is what it shows so far. */
  check(text: string, offset: number): ReplyResult {
    const out: ReplyResult = { send: [], disabled: [], errors: [] };
    for (const rule of this.rules) {
      if (!rule.enabled || !rule.pattern || this.firedAt.get(rule.id) === offset) continue;
      const groups = matchGroups(rule, text);
      if (!groups) continue;
      this.firedAt.set(rule.id, offset);
      const t = this.now();
      const times = (this.recent.get(rule.id) ?? []).filter((x) => t - x < 1000);
      times.push(t);
      this.recent.set(rule.id, times);
      if (times.length > MAX_PER_SECOND) {
        rule.enabled = false;
        out.disabled.push(rule);
        continue;
      }
      try {
        const replyText = rule.regex ? rule.reply.replace(/\$(\d)/g, (_, d: string) => groups[Number(d)] ?? '') : rule.reply;
        out.send.push({ rule, bytes: parseEscapes(replyText) });
      } catch (e) {
        out.errors.push({ rule, message: (e as Error).message });
      }
    }
    return out;
  }
}

function matchGroups(rule: AutoReply, text: string): string[] | null {
  if (!rule.regex) {
    const m = buildMatcher(rule.pattern, { caseSensitive: rule.caseSensitive, regex: false });
    return typeof m === 'function' && m(text).length ? [rule.pattern] : null;
  }
  try {
    const m = new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i').exec(text);
    return m ? [...m] : null;
  } catch {
    return null;
  }
}
