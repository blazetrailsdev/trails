/**
 * Ruby → JS naming, delegated to the repo's existing api-compare conventions
 * (the source of truth per the spike brief). We reuse `rubyMethodToTs`,
 * `snakeToCamel`, and `rubyFileToTs` rather than inventing a parallel scheme —
 * the only local decision is picking the first candidate from the ambiguous
 * predicate lists api-compare returns.
 */
import { rubyMethodToTs, snakeToCamel, rubyFileToTs } from "../api-compare/conventions.js";

export { snakeToCamel, rubyFileToTs };

/** Method-name identifier for a definition/call site (first candidate wins). */
export function methodName(rubyName: string): string {
  const candidates = rubyMethodToTs(rubyName);
  if (candidates && candidates.length) return candidates[0];
  // Operators / skipped names have no JS surface; keep something legible.
  return snakeToCamel(rubyName.replace(/[?!=]/g, ""));
}

/**
 * Invert `rubyFileToTs`: given a trails `.ts` path (relative to a package lib
 * root), find the Rails `.rb` file that maps to it. We reuse the forward map
 * rather than build a new one — scan the Rails tree and match. The caller
 * supplies the candidate Rails files.
 */
export function tsToRubyFile(tsRelPath: string, rubyCandidates: string[]): string | undefined {
  const normalized = tsRelPath.replace(/\\/g, "/");
  return rubyCandidates.find((rb) => rubyFileToTs(rb) === normalized);
}
