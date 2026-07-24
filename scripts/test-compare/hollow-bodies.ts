/**
 * Hollow-body detector — the false-negative class test:compare cannot see.
 *
 * test:compare matches our tests to Rails' BY NAME, so a test whose name
 * promises a behaviour but whose body never exercises it reports coverage it
 * does not provide: it passes against a broken implementation. PR #4892 (the
 * `Notifications.instrument` payload-yield deviation) survived exactly this way
 * behind six name-matched tests with hollow bodies.
 *
 * This module classifies a test as hollow from its extracted shape alone (name
 * + assertion counts + no-op callbacks) — see {@link classifyTest}. It is a
 * heuristic, deliberately narrow: it only fires on names that PROMISE a
 * behaviour, so a plain setup-only test is never flagged.
 */
import type { TestCaseInfo } from "./types.js";

/**
 * Names that promise the test observes a behaviour. Split by what the body must
 * then contain, so each hollow reason can name the promise it broke.
 */
const YIELD_PROMISE =
  /\b(yields?|yielding|is changed during|modif(?:y|ies|ied)|mutat(?:e|es|ed)|passes? the .* to|during instrumentation)\b/i;
/**
 * The narrower subset that promises something is WRITTEN TO — the exact shape
 * of the six hollow tests #4892 exposed. Rails' originals mutate the yielded
 * payload; a body that writes to nothing at all cannot be testing this name.
 */
/** Ruby bang methods mutate their receiver by the CALL, not by an assignment. */
const BANG_METHOD = /(!|\bwith bang\b)/i;
const MUTATION_PROMISE = /\b(for further modification|is changed during|modifies|mutates)\b/i;
/**
 * Names that promise a raise. Used only to widen the zero-assertion rule — NOT
 * to demand a `toThrow` matcher: a raise is legitimately observed by a
 * try/catch helper plus `toBeInstanceOf`, so matcher-shape alone produces
 * overwhelming false positives (221 of 233 findings in the first sweep, nearly
 * all real assertions behind a `runAndCatch`-style helper). Proving a
 * raise-named body actually observes the raise needs a body-vs-Rails diff,
 * which is out of this detector's scope.
 */
const RAISE_PROMISE = /\b(raises?|throws?|errors? (?:if|when|on))\b/i;
/**
 * A NEGATED promise ("does not mutate the options", "should not raise") is the
 * inverse shape: Rails' own body is an `assert_nothing_raised` / a no-op block,
 * so an assertion-free body or a `() => {}` is the faithful port, not a hollow
 * one. Excluded outright.
 */
// Explicit auxiliary list rather than a `\w+n't` pattern: the apostrophe-less
// spellings we actually use ("doesnt", "shouldnt") collide with ordinary words
// ending in "nt" — "instrument" among them, the very name this detector exists
// to catch.
const NEGATED_PROMISE =
  /\b(not|never|without|does ?n'?t|did ?n'?t|do ?n'?t|should ?n'?t|would ?n'?t|wo ?n'?t|is ?n'?t|are ?n'?t|ca ?n'?t|could ?n'?t)\b/i;
const BEHAVIOUR_PROMISE = new RegExp(`${YIELD_PROMISE.source}|${RAISE_PROMISE.source}`, "i");

export type HollowReason =
  /** The name promises a behaviour and the body asserts nothing at all. */
  | "no-assertions"
  /**
   * The name promises the block yields/mutates something, and the body passes a
   * no-op `() => {}` where that mutation would go.
   */
  | "empty-callback"
  /**
   * The name promises something is mutated, and the body writes to nothing.
   */
  | "no-mutation";

export interface HollowFinding {
  path: string;
  file: string;
  line: number;
  reason: HollowReason;
}

/**
 * Classify one extracted test. Returns `null` for tests that are fine, pending
 * (a skip is an honest TODO, not a false signal), or whose name makes no
 * behavioural promise for the body to break.
 */
export function classifyTest(tc: TestCaseInfo): HollowReason | null {
  if (tc.pending) return null;
  if (!BEHAVIOUR_PROMISE.test(tc.description)) return null;
  if (NEGATED_PROMISE.test(tc.description)) return null;

  const assertionCount = tc.assertionCount ?? tc.assertions.length;
  if (assertionCount === 0) return "no-assertions";

  const empty = tc.emptyCallbacks ?? 0;
  if (YIELD_PROMISE.test(tc.description) && empty > 0 && empty === (tc.callbackCount ?? 0)) {
    return "empty-callback";
  }

  // Gated on the body actually handing out a block: "mutates" on a bang method
  // (`symbolizeKeysBang`) is mutation performed BY the call, invisible as an
  // assignment, so those names are excluded outright.
  if (
    MUTATION_PROMISE.test(tc.description) &&
    !BANG_METHOD.test(tc.description) &&
    (tc.callbackCount ?? 0) > 0 &&
    (tc.bodyMutations ?? 0) === 0
  ) {
    return "no-mutation";
  }

  return null;
}

/** Classify every test in a set of extracted files, ordered as given. */
export function findHollowTests(testCases: TestCaseInfo[]): HollowFinding[] {
  const findings: HollowFinding[] = [];
  for (const tc of testCases) {
    const reason = classifyTest(tc);
    if (reason) findings.push({ path: tc.path, file: tc.file, line: tc.line, reason });
  }
  return findings;
}

/** Group findings by file, worst (most findings) first, for the report. */
export function worstOffenders(findings: HollowFinding[]): { file: string; count: number }[] {
  const byFile = new Map<string, number>();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  return [...byFile]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

/** Render the sweep as a plain-text report. */
export function formatReport(findings: HollowFinding[], totalTests: number): string {
  const lines: string[] = [];
  const byReason = new Map<HollowReason, number>();
  for (const f of findings) byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);

  lines.push(`Hollow-body sweep: ${findings.length} findings across ${totalTests} tests`);
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${reason}: ${count}`);
  }
  lines.push("");
  lines.push("Worst offenders:");
  for (const { file, count } of worstOffenders(findings).slice(0, 20)) {
    lines.push(`  ${count.toString().padStart(4)}  ${file}`);
  }
  lines.push("");
  lines.push("Findings:");
  for (const f of findings) {
    lines.push(`  ${f.file}:${f.line}  [${f.reason}]  ${f.path}`);
  }
  return lines.join("\n");
}
