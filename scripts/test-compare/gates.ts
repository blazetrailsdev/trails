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

/**
 * `AdapterClassName` literal (support/adapter-helper.ts, the port of Rails'
 * `test/support/adapter_helper.rb`) → normalized {@link GateAdapter}. Rails
 * spells the same predicate `current_adapter?(:PostgreSQLAdapter)`, so both
 * `TrilogyAdapter` and `Mysql2Adapter` land on the one `mysql` lane the
 * comparison knows.
 */
const ADAPTER_CLASS_MAP: Record<string, GateAdapter> = {
  SQLite3Adapter: "sqlite",
  PostgreSQLAdapter: "postgresql",
  Mysql2Adapter: "mysql",
  TrilogyAdapter: "mysql",
};

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
 * describeIfMysqlAdapter), which is distinct from an absent key (= "runs on all").
 * Mirrors the Ruby extractor's `finalize_gate` (`merged.key?(:adapters)`).
 */
export function finalizeGate(gate: TestGate): TestGate {
  const out: TestGate = { source: sortedUnique(gate.source) };
  if (gate.adapters) out.adapters = sortedUnique(gate.adapters);
  if (gate.features?.length) out.features = sortedUnique(gate.features);
  if (gate.guards?.length) out.guards = sortedUnique(gate.guards);
  return out;
}

export const ADAPTER_GATE_WRAPPERS = [
  "describeIfPg",
  "describeIfPostgresqlAdapter",
  "describeIfMysqlAdapter",
  "describeIfSqlite",
] as const;

const REGISTERED_GATE_WRAPPERS: ReadonlySet<string> = new Set<string>([
  ...ADAPTER_GATE_WRAPPERS,
  "describeIfSupports",
  "itIfSupports",
]);

function isGateWrapperName(name: string): boolean {
  return /^(?:describe|it)If[A-Z]/.test(name);
}

// An unregistered wrapper would otherwise fall through gateFromWrapper's
// `default` arm to `null` — "no gate" — so every test inside it reads as
// ungated and surfaces only as an unexplained gate-mismatch count.
export function assertRegisteredGateWrapper(name: string, file?: string): void {
  if (!isGateWrapperName(name) || REGISTERED_GATE_WRAPPERS.has(name)) return;
  const where = file ? ` (used in ${file})` : "";
  throw new Error(
    `test-compare: unregistered gate wrapper \`${name}\`${where}. ` +
      "Tests inside it would silently read as ungated. Register it in " +
      "`gateFromWrapper` (scripts/test-compare/gates.ts) and, if it takes the " +
      "title as its first argument, in `ADAPTER_GATE_WRAPPERS` there too.",
  );
}

/**
 * Gate implied by a conditional `describe`/`it` wrapper identifier. Returns
 * `null` for plain `describe`/`it`/`test` (no gate) and throws for an
 * unregistered `describeIf*`/`itIf*` identifier. `featureArg` carries the
 * first string argument for `describeIfSupports("json", …)` /
 * `itIfSupports("json", …)`.
 */
export function gateFromWrapper(name: string, featureArg?: string | null): TestGate | null {
  switch (name) {
    case "describeIfPg":
      return { adapters: ["postgresql"], source: ["wrapper"] };
    // The port of `current_adapter?(:PostgreSQLAdapter)`.
    case "describeIfPostgresqlAdapter":
      return { adapters: ["postgresql"], source: ["wrapper"] };
    // The port of `current_adapter?(:Mysql2Adapter)`.
    case "describeIfMysqlAdapter":
      return { adapters: ["mysql"], source: ["wrapper"] };
    case "describeIfSqlite":
      return { adapters: ["sqlite"], source: ["wrapper"] };
    case "describeIfSupports":
    case "itIfSupports":
      return featureArg
        ? { features: [featureArg], source: ["wrapper"] }
        : { guards: ["unknown"], source: ["wrapper"] };
    default:
      assertRegisteredGateWrapper(name);
      return null;
  }
}

/**
 * Resolve the gate of an `it.skipIf(<expr>)` / `runIf(<expr>)` call from the
 * expression source text. `runsWhenTrue` is `false` for `skipIf` (it skips
 * when the expression is true, so it runs when false) and `true` for `runIf`.
 *
 * Recognizes the adapter idiom in the suite — `adapterType === "mysql"` /
 * `adapterType !== "sqlite"` — anywhere in the expression, the Rails-named
 * `currentAdapter("PostgreSQLAdapter")` predicate (variadic, and negatable with
 * `!`), and feature predicates — `adapterSupports("x")`. How a compound mixing
 * the two resolves depends on the adapter term's polarity, mirroring the Ruby
 * extractor's `mixed` rule:
 *   - EXCLUSION (`adapterType === "sqlite" || !adapterSupports("insert_returning")`,
 *     the De-Morgan'd skip form of Rails' `if supports_insert_returning? &&
 *     !current_adapter?(:SQLite3Adapter)`) → the run condition is the pure
 *     conjunction `!sqlite && insert_returning?`, so BOTH the adapter exclusion
 *     `[mysql,postgresql]` and the feature set are sound and emitted. When the
 *     run condition is instead a DISJUNCTION (`skipIf(adapterType === "mysql" &&
 *     !supportsRenameIndex)` runs when `!mysql || supportsRenameIndex`) the
 *     exclusion is unsound — the test does run on the excluded adapter wherever
 *     the other term holds — so it too is dropped.
 *   - POSITIVE (`adapterType !== "mysql" || !adapterSupports("expression_index")`)
 *     → the run condition is again a pure conjunction (`mysql && expression_index?`),
 *     so the adapter set and the feature set are BOTH sound and emitted — the
 *     intersection is exactly what runs. Mirrors Ruby keeping a positive
 *     `adapter_syms` set alongside a feature in a pure `&&` condition.
 *   - A feature's own polarity is read the same way: while the run condition is a
 *     pure conjunction, a run-NEGATED predicate becomes a `no_<feature>` guard
 *     instead of an inverted `features` entry (see below).
 *   - A `mariadb` GUARD is different: it is a runtime predicate neither side can
 *     evaluate statically, so a positive adapter set mixed with one is dropped
 *     rather than over-claiming a partial restriction (Ruby does the same).
 * Anything with neither adapter nor feature resolves to a `guards: ["unknown"]`
 * gate so the comparison knows the test is conditional without inventing an
 * adapter set.
 *
 * Source is `"test"` (per-test inline guard) — the TS analog of the Ruby
 * extractor's `"body-skip"`, distinct from a named `"wrapper"` suite.
 */
export function gateFromGuardExpr(exprText: string, runsWhenTrue: boolean): TestGate {
  const text = exprText.trim();

  // `adapterType (===|!==) "literal"` — matched anywhere (not anchored) so it
  // is picked up alongside feature predicates in a compound guard. Only a single
  // adapterType term is supported (the suite's idiom); the first is used. In the
  // standard skip idiom `skipIf(A || B || …)` (run iff every term is false) the
  // adapter term's contribution is evaluated in isolation — exactly the
  // single-term polarity below — and likewise for `runIf(A && B && …)`. Any
  // other shape makes the run-on set a disjunction; see `runIsDisjunctive`.
  const adapterMatch = text.match(/adapterType\s*(===|!==)\s*["']([a-z0-9]+)["']/);
  let adapters: GateAdapter[] | undefined;
  let adapterIsPositive = false;
  if (adapterMatch) {
    const [, op, literal] = adapterMatch;
    const adapter = normalizeAdapterType(literal);
    if (adapter) {
      // Does the expression being true mean "is this adapter"?
      const trueMeansEqual = op === "===";
      const runWhenEqual = runsWhenTrue ? trueMeansEqual : !trueMeansEqual;
      adapterIsPositive = runWhenEqual;
      adapters = sortedUnique(runWhenEqual ? [adapter] : ALL_ADAPTERS.filter((a) => a !== adapter));
    }
  }

  // `currentAdapter("PostgreSQLAdapter")` / `!currentAdapter("Mysql2Adapter",
  // "TrilogyAdapter")` — the port of Rails' own `current_adapter?`, which the
  // Ruby extractor reads directly. It is variadic, so the literals UNION (true
  // when the lane is any one of them); polarity then reads exactly as for
  // `adapterType` above. Consulted only when no `adapterType` term was found,
  // keeping that block's "the first adapter term wins" rule.
  if (!adapters) {
    const currentAdapterMatch = text.match(/(!\s*)?currentAdapter\(([^)]*)\)/);
    if (currentAdapterMatch) {
      const [, negatedInText, argsText] = currentAdapterMatch;
      const named = [...argsText.matchAll(/["']([A-Za-z0-9]+)["']/g)]
        .map((m) => ADAPTER_CLASS_MAP[m[1]])
        .filter((a): a is GateAdapter => a !== undefined);
      if (named.length > 0) {
        const trueMeansIs = !negatedInText;
        const runWhenIs = runsWhenTrue ? trueMeansIs : !trueMeansIs;
        adapterIsPositive = runWhenIs;
        adapters = sortedUnique(runWhenIs ? named : ALL_ADAPTERS.filter((a) => !named.includes(a)));
      }
    }
  }

  // The TS twin of the Ruby extractor's `has_or`. The run condition is `expr`
  // for `runIf` and `!expr` for `skipIf`, so the operator that makes the run-on
  // set a DISJUNCTION differs by form: `||` under `runIf`, and (by De Morgan)
  // `&&` under `skipIf`. Deliberately coarse and textual, like
  // `scan_run_condition`, which sets `has_or` for a `||` anywhere in the
  // condition sexp rather than only at the top level.
  const runIsDisjunctive = runsWhenTrue ? text.includes("||") : text.includes("&&");

  // `adapterSupports("feature")` calls — the TS analog of Rails' `supports_X?`
  // feature predicates. Polarity is read at RUN-CONDITION level, so a term's
  // effective negation is its textual `!` flipped by the `skipIf` form.
  //
  // While the run condition is a pure CONJUNCTION each term stands on its own,
  // and a run-negated feature becomes a `no_<feature>` guard — Rails' own
  // vocabulary, which `gate_from_run_condition` emits for the same shapes. That
  // is what keeps the extractors in lockstep on `if current_adapter?(:X) &&
  // !supports_y?`: the adapter set survives the pure conjunction, so lumping `y`
  // into `features` would state the OPPOSITE capability alongside it.
  //
  // Under a DISJUNCTION the terms no longer decompose, so collection stays
  // polarity-blind — the conservative "this capability is involved" claim,
  // matching Ruby listing every `supports_X?` regardless of negation.
  const splitFeaturePolarity = !runIsDisjunctive;
  const featureTerms = [
    ...text.matchAll(/(!\s*)?adapterSupports\(\s*["']([a-z0-9_]+)["']\s*\)/g),
  ].map((m) => {
    const negatedInText = Boolean(m[1]);
    return { negated: runsWhenTrue ? negatedInText : !negatedInText, name: m[2] };
  });
  const collectedFeatures = featureTerms
    .filter((t) => !splitFeaturePolarity || !t.negated)
    .map((t) => t.name);
  // The twin of `gate_from_run_condition`'s `if positive || split` arm
  // (extract-ruby-tests.rb:1080-1086). On the run-when-FALSE path (`skipIf`)
  // with no split available, the polarity-blind collection above is the SOURCE
  // condition's capability claim, and the test runs on that condition's
  // negation — so Ruby banks it as `no_<feature>` rather than asserting the
  // capability. TS collected it as a plain feature, which made every
  // `skipIf(<adapter> && !adapterSupports("x"))` state the opposite of the
  // Rails gate it mirrors; now that `no_<feature>` is a compared dimension
  // (see `signedFeatures`) that asymmetry would read as a `wrong-gate`.
  const emitCollectedAsInverted = !runsWhenTrue && !splitFeaturePolarity;
  const featureMatches = emitCollectedAsInverted ? [] : collectedFeatures;
  const invertedFeatures = splitFeaturePolarity
    ? featureTerms.filter((t) => t.negated).map((t) => `no_${t.name}`)
    : emitCollectedAsInverted
      ? collectedFeatures.map((name) => `no_${name}`)
      : [];

  // `isMariaDb` (test-helper boolean) / `isMariadb()` (adapter method) — the
  // TS analogs of Rails' `mariadb?` predicate, which the Ruby extractor records
  // as a `mariadb` guard. Polarity-blind, like the feature predicates above.
  const guards: string[] = [];
  if (/isMaria[Dd]b\b/.test(text)) guards.push("mariadb");

  // The `mixed` rule (see the docstring): a POSITIVE adapter set is dropped when
  // the compound carries a non-comparable guard, and — since the set is only
  // sound as the INTERSECTION `adapter ∩ feature` — also when a feature rides
  // along on a disjunctive run condition, where the real run-on set is the union
  // `adapter ∪ feature`. That second clause is the twin of Ruby gating the same
  // case on `!acc[:has_or]`. An adapter EXCLUSION is sound only while the run
  // condition stays a conjunction, so it is dropped whenever the condition is
  // disjunctive — the test does run on the excluded adapter wherever the other
  // term holds. That is the twin of Ruby's negated-adapter branch, likewise
  // gated on `!acc[:has_or]`.
  // A feature term makes a positive adapter set unsound regardless of the
  // polarity it was banked at — `no_<feature>` is a restriction like any other,
  // so it counts here exactly as a plain feature does (Ruby's `any_feature`
  // likewise unions `features` and `inverted_features`).
  const anyFeature = featureMatches.length > 0 || invertedFeatures.length > 0;
  const mixed = adapterIsPositive
    ? guards.length > 0 || (anyFeature && runIsDisjunctive)
    : runIsDisjunctive;
  const gate: TestGate = { source: ["test"] };
  if (adapters && !mixed) gate.adapters = adapters;
  if (featureMatches.length) gate.features = sortedUnique(featureMatches);
  // `invertedFeatures` merges in only here: `guards` is the bucket `mixed` reads
  // to DROP a positive adapter set, and a `no_<feature>` must not do that — the
  // adapter set is sound precisely because the conjunction is pure.
  const allGuards = [...guards, ...invertedFeatures];
  if (allGuards.length) gate.guards = sortedUnique(allGuards);
  if (!gate.adapters && !gate.features && !gate.guards) gate.guards = ["unknown"];
  return gate;
}

// ---------------------------------------------------------------------------
// Gate-mismatch classification (consumed by compare.ts)
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
 * The `no_<feature>` prefix both extractors use for a feature restriction
 * reached under inverted polarity — a run condition that requires the lane to
 * NOT support the capability. The Ruby side emits it from
 * `gate_from_run_condition` (`extract-ruby-tests.rb`, the `inverted_features`
 * and run-when-false `features` arms) and the TS side from
 * `gateFromGuardExpr`'s `invertedFeatures` above. Because both spell it
 * identically it is a SIGNED FEATURE, not an extractor-local guard vocabulary,
 * and it is compared across sides like any other feature.
 */
const INVERTED_FEATURE_PREFIX = "no_";

/**
 * The signed-feature restriction of a gate: its plain `features` plus the
 * `no_<feature>` entries parked in `guards`. `no_x` and `x` are deliberately
 * distinct strings, so a side requiring the capability and a side requiring its
 * absence produce different keys and surface as a `wrong-gate` rather than
 * comparing equal.
 */
function signedFeatures(g: TestGate): string[] {
  const inverted = (g.guards ?? []).filter((guard) => guard.startsWith(INVERTED_FEATURE_PREFIX));
  return [...(g.features ?? []), ...inverted];
}

/**
 * Only the adapter + signed-feature dimensions are compared across sides. The
 * REMAINING `guards` (mariadb / version / in_memory_db / unknown /
 * always_skip) use different vocabularies in the Ruby vs TS extractors, so a
 * gate restricted only by those is treated as not-comparable (informational,
 * never a mismatch). `no_<feature>` guards are the exception and DO compare —
 * see {@link signedFeatures}: leaving them out meant any pair whose only real
 * restriction was an inverted feature was invisible to `gate-mismatch`, so the
 * two sides could restrict to opposite feature sets in silence.
 */
function comparable(g: TestGate | undefined): boolean {
  return !!g && (restrictsByAdapter(g) || signedFeatures(g).length > 0);
}

/**
 * Is the gate effectively "runs everywhere"? True when absent, or when it
 * names all adapters with no feature/guard restriction. A gate carrying only
 * INCOMPARABLE guards (`mariadb`, a version predicate, `unknown`) is a
 * real-but-unreadable restriction, so it is NOT unconditional — flagging
 * `over-gated` against it would be a false positive. A `no_<feature>` guard is
 * no longer in that bucket: it is a signed feature and makes the gate
 * `comparable`, so it never reaches here.
 */
function effectivelyUnconditional(g: TestGate | undefined): boolean {
  return !g || (!comparable(g) && (g.guards?.length ?? 0) === 0);
}

function adapterFeatureKey(g: TestGate): string {
  // All-adapters or absent → "*" ("runs on all"); an empty set → "" ("runs
  // nowhere"), kept distinct. Signed features sorted; the remaining
  // (incomparable) guards and `source` ignored.
  const a = restrictsByAdapter(g) ? [...g.adapters!].sort().join(",") : "*";
  const f = signedFeatures(g).sort().join(",");
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
