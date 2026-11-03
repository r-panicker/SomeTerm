export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
}

export type Matcher = (text: string) => [number, number][];

/**
 * Builds a matcher, or returns an error message for an invalid regex.
 * Empty matches are skipped so patterns like `a*` cannot match everywhere.
 */
export function buildMatcher(query: string, o: SearchOptions): Matcher | string | null {
  if (!query) return null;
  let re: RegExp;
  try {
    const source = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(source, o.caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return (e as Error).message;
  }
  return (text) => {
    const out: [number, number][] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      out.push([m.index, m.index + m[0].length]);
    }
    return out;
  };
}
