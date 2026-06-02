// Gate helpers shared across the TS extractor (and, later, the comparison).
//
// A "gate" is the static answer to "under which adapters / DB features does
// this test run?". This module normalizes the TS-side gating vocabulary
// (`describeIfPg` / `describeIfSupports` / `it.skipIf`) into the adapter- and
// feature-agnostic {@link TestGate} shape that mirrors what the Ruby extractor
// derives from `current_adapter?` / `supports_X?`.

import type { GateAdapter, TestGate } from "./types.js";

export const ALL_ADAPTERS: GateAdapter[] = ["mysql", "postgresql", "sqlite"];

/** `adapterType` literal (test-adapter.ts) → normalized {@link GateAdapter}. */
const ADAPTER_TYPE_MAP: Record<string, GateAdapter> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  sqlite: "sqlite",
};

export function normalizeAdapterType(literal: string): GateAdapter | null {
  return ADAPTER_TYPE_MAP[literal] ?? null;
}

function sortedUnique<T>(xs: T[]): T[] {
  return [...new Set(xs)].sort();
}

/**
 * Combine two gates so both conditions apply (logical AND). Adapter sets
 * intersect (a test under both `describeIfPg` and an inner mysql guard runs
 * nowhere); feature/guard/source lists union.
 */
export function mergeGate(base: TestGate | undefined, add: TestGate): TestGate {
  if (!base) return add;
  const merged: TestGate = { source: sortedUnique([...base.source, ...add.source]) };

  if (base.adapters && add.adapters) {
    const set = new Set(add.adapters);
    merged.adapters = sortedUnique(base.adapters.filter((a) => set.has(a)));
  } else if (base.adapters || add.adapters) {
    merged.adapters = sortedUnique([...(base.adapters ?? []), ...(add.adapters ?? [])]);
  }

  const features = [...(base.features ?? []), ...(add.features ?? [])];
  if (features.length) merged.features = sortedUnique(features);

  const guards = [...(base.guards ?? []), ...(add.guards ?? [])];
  if (guards.length) merged.guards = sortedUnique(guards);

  return merged;
}

/**
 * Normalize a freshly-built gate's array fields (sort + de-dupe). A
 * *present-but-empty* `adapters` array is preserved (not dropped): it means
 * contradictory gates intersected to "runs on no adapter" (e.g. describeIfPg ▸
 * describeIfMysql), which is distinct from an absent key (= "runs on all").
 * Mirrors the Ruby extractor's `finalize_gate` (`merged.key?(:adapters)`).
 */
export function finalizeGate(gate: TestGate): TestGate {
  const out: TestGate = { source: sortedUnique(gate.source) };
  if (gate.adapters) out.adapters = sortedUnique(gate.adapters);
  if (gate.features?.length) out.features = sortedUnique(gate.features);
  if (gate.guards?.length) out.guards = sortedUnique(gate.guards);
  return out;
}

/**
 * Gate implied by a conditional `describe`/`it` wrapper identifier. Returns
 * `null` for plain `describe`/`it`/`test` (no gate). `featureArg` carries the
 * first string argument for `describeIfSupports("json", …)` /
 * `itIfSupports("json", …)`.
 */
export function gateFromWrapper(name: string, featureArg?: string | null): TestGate | null {
  switch (name) {
    case "describeIfPg":
      return { adapters: ["postgresql"], source: ["wrapper"] };
    case "describeIfMysql":
      return { adapters: ["mysql"], source: ["wrapper"] };
    case "describeIfSqlite":
      return { adapters: ["sqlite"], source: ["wrapper"] };
    case "describeIfSupports":
    case "itIfSupports":
      return featureArg
        ? { features: [featureArg], source: ["wrapper"] }
        : { guards: ["unknown"], source: ["wrapper"] };
    default:
      return null;
  }
}

/**
 * Resolve the gate of an `it.skipIf(<expr>)` / `runIf(<expr>)` call from the
 * expression source text. `runsWhenTrue` is `false` for `skipIf` (it skips
 * when the expression is true, so it runs when false) and `true` for `runIf`.
 *
 * Recognizes the adapter idiom in the suite — `adapterType === "mysql"` /
 * `adapterType !== "sqlite"`. Anything else resolves to a `guards: ["unknown"]`
 * gate so the comparison knows the test is conditional without inventing an
 * adapter set.
 *
 * Source is `"test"` (per-test inline guard) — the TS analog of the Ruby
 * extractor's `"body-skip"`, distinct from a named `"wrapper"` suite.
 */
export function gateFromGuardExpr(exprText: string, runsWhenTrue: boolean): TestGate {
  const text = exprText.trim();

  // adapterType (===|!==) "literal"
  const adapterMatch = text.match(/^adapterType\s*(===|!==)\s*["']([a-z0-9]+)["']$/);
  if (adapterMatch) {
    const [, op, literal] = adapterMatch;
    const adapter = normalizeAdapterType(literal);
    if (adapter) {
      // Does the expression being true mean "is this adapter"?
      const trueMeansEqual = op === "===";
      const runWhenEqual = runsWhenTrue ? trueMeansEqual : !trueMeansEqual;
      const adapters = runWhenEqual ? [adapter] : ALL_ADAPTERS.filter((a) => a !== adapter);
      return { adapters: sortedUnique(adapters), source: ["test"] };
    }
  }

  return { guards: ["unknown"], source: ["test"] };
}

// ---------------------------------------------------------------------------
// Gate-mismatch classification (consumed by test-compare.ts)
// ---------------------------------------------------------------------------

/**
 * A divergence between how Rails gates a matched test and how our TS suite
 * gates it:
 *   - `should-gate`  — Rails runs it conditionally, but we `it.skip` it as a
 *     TODO (no gate). It likely already passes under the right adapter; gate
 *     it (describeIfPg / itIfSupports) instead of treating it as unimplemented.
 *   - `missing-gate` — Rails runs it conditionally, but we run it
 *     unconditionally (no gate, not skipped). Risk of a wrong-adapter false
 *     pass / divergent behavior.
 *   - `wrong-gate`   — both gate it, but to different adapter/feature sets.
 *   - `over-gated`   — Rails runs it everywhere, but we gate it.
 */
export type GateMismatchKind = "should-gate" | "missing-gate" | "wrong-gate" | "over-gated";

/**
 * Does the gate restrict by adapter? True only for a *proper* subset (1–2
 * adapters, or the empty "runs nowhere" set). A gate naming all three adapters
 * is effectively unconditional (e.g. Rails `current_adapter?(:Pg,:Mysql,
 * :Sqlite)`), so it does NOT restrict — otherwise "we run it everywhere" would
 * be flagged against it as a false positive.
 */
function restrictsByAdapter(g: TestGate): boolean {
  return g.adapters !== undefined && g.adapters.length < ALL_ADAPTERS.length;
}

/**
 * Only the adapter + feature dimensions are compared across sides — `guards`
 * (mariadb / version / in_memory_db / unknown / always_skip) and `source` use
 * different vocabularies in the Ruby vs TS extractors, so a guard-only gate is
 * treated as not-comparable (informational, never a mismatch).
 */
function comparable(g: TestGate | undefined): boolean {
  return !!g && (restrictsByAdapter(g) || (g.features?.length ?? 0) > 0);
}

/**
 * Is the gate effectively "runs everywhere"? True when absent, or when it
 * names all adapters with no feature/guard restriction. A *guard-only* gate
 * (e.g. `skip if supports_transaction_isolation?` → `guards:["no_…"]`) is a
 * real-but-incomparable restriction, so it is NOT unconditional — flagging
 * `over-gated` against it would be a false positive.
 */
function effectivelyUnconditional(g: TestGate | undefined): boolean {
  return !g || (!comparable(g) && (g.guards?.length ?? 0) === 0);
}

function adapterFeatureKey(g: TestGate): string {
  // All-adapters or absent → "*" ("runs on all"); an empty set → "" ("runs
  // nowhere"), kept distinct. Features sorted; guards/source ignored.
  const a = restrictsByAdapter(g) ? [...g.adapters!].sort().join(",") : "*";
  const f = g.features ? [...g.features].sort().join(",") : "";
  return `${a}|${f}`;
}

/**
 * Classify the gate divergence for a matched Rails↔TS test pair, or `null` when
 * they agree (or neither is comparably gated — e.g. both unconditional, or a
 * genuine `it.skip` TODO of a test Rails also runs unconditionally).
 *
 * `tsPending` is consulted ONLY when Rails is comparably gated and the TS side
 * is not — to split `should-gate` (we TODO-skip it) from `missing-gate` (we run
 * it unconditionally). When the TS side is itself comparably gated, `tsPending`
 * is irrelevant: the test already has a gate, so the only question is whether it
 * matches Rails' (`wrong-gate`) — e.g. `classifyGateMismatch(pg, mysql, true)`
 * is `wrong-gate`, not `should-gate`.
 */
export function classifyGateMismatch(
  rails: TestGate | undefined,
  ts: TestGate | undefined,
  tsPending: boolean,
): GateMismatchKind | null {
  const railsGated = comparable(rails);
  const tsGated = comparable(ts);
  if (railsGated && tsGated) {
    return adapterFeatureKey(rails!) === adapterFeatureKey(ts!) ? null : "wrong-gate";
  }
  if (railsGated) return tsPending ? "should-gate" : "missing-gate";
  // We gate it but Rails doesn't comparably. Only call it over-gated when Rails
  // is effectively unconditional; if Rails has an incomparable guard, we can't
  // tell, so stay silent.
  if (tsGated) return effectivelyUnconditional(rails) ? "over-gated" : null;
  return null;
}
