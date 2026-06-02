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

/** Normalize a freshly-built gate's array fields (sort + de-dupe). */
export function finalizeGate(gate: TestGate): TestGate {
  const out: TestGate = { source: sortedUnique(gate.source) };
  if (gate.adapters?.length) out.adapters = sortedUnique(gate.adapters);
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
      return { adapters: sortedUnique(adapters), source: ["wrapper"] };
    }
  }

  return { guards: ["unknown"], source: ["wrapper"] };
}
