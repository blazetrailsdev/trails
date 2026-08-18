import { describe, it, expect } from "vitest";
import {
  nameMatches,
  superclassesMatch,
  primaryClassesPerFile,
  resolveTsClassForRuby,
  methodInMode,
  tsShouldIncludeInIndex,
  flattenIncludedMethodInfos,
  mixinMethodCreditedToOwnFile,
  reopeningMethodCreditedToOwnFile,
  resolveModuleName,
  buildModuleIncluderFqns,
  dedupeRubyMethodInto,
  NAME_COLLISION_CLUSTERS,
  selectMisplacedFile,
  rubyFileHasTsCounterpart,
  MISPLACED_MIN_HITS,
  blazetrailsDepKeys,
  buildEntitiesByName,
  resolveEntityByDeclaringFile,
  significantMissingCalls,
  suppressedCallClaims,
  narrowPredicateCandidates,
  ambiguousTsNames,
  reorderedCalls,
  ORDER_PREFIX,
  resolvePortedWithArgsSigs,
  jsEnumerableAliases,
  JS_ENUMERABLE_ALIASES,
  NEGATED_ALIASES,
  partitionNegatedCalls,
  SIGNIFICANT_CALLS,
  dropWeakCalls,
  NO_JS_CALL_FORM,
  isDelegatingWrapper,
  effectiveTsCalls,
  reachedSameFileMethods,
  SAME_FILE_CLOSURE_DEPTH,
  callTagKey,
  splitOverriddenFileBuckets,
  resolveTsOwner,
  ownerCallArgSites,
  ambiguousTsOwner,
  ambiguousRubyOwner,
  rubyOwnerSeat,
  tsOwnerSeat,
  writerPairedWithReader,
  staleCallTags,
  suppressTaggedCalls,
  tagsForOwner,
} from "./compare.js";
import { rubyMethodToTs } from "@blazetrails/parity/conventions";
import type {
  ApiManifest,
  ClassInfo,
  MethodInfo,
  PackageInfo,
  ParamInfo,
} from "@blazetrails/parity/types";

function cls(file: string, name: string, superclass?: string): ClassInfo {
  return {
    file,
    name,
    superclass,
    includes: [],
    extends: [],
    instanceMethods: [],
    classMethods: [],
  };
}

function method(name: string): MethodInfo {
  return { name, visibility: "public", params: [] };
}

function makeManifest(
  packages: Record<
    string,
    { classes?: Record<string, ClassInfo>; modules?: Record<string, ClassInfo> }
  >,
): ApiManifest {
  const result: ApiManifest = { source: "typescript", generatedAt: "", packages: {} };
  for (const [pkg, p] of Object.entries(packages)) {
    result.packages[pkg] = { classes: p.classes ?? {}, modules: p.modules ?? {} };
  }
  return result;
}

describe("resolvePortedWithArgsSigs", () => {
  const sig = (n: number): ParamInfo[] =>
    Array.from({ length: n }, (_, i) => ({ name: `a${i}`, kind: "required" }) as ParamInfo);
  const byFileName = new Map([
    ["arel/nodes.ts", new Map([["first", [sig(0)]]])],
    ["relation.ts", new Map([["first", [sig(1)]]])],
  ]);
  const byNameInPkg = new Map([["first", [sig(0), sig(1)]]]);

  it("prefers the same file's signatures over the package pool", () => {
    expect(resolvePortedWithArgsSigs(byFileName, byNameInPkg, "arel/nodes.ts", "first")).toEqual([
      sig(0),
    ]);
  });

  it("falls back to the package pool when the file does not define the name", () => {
    expect(resolvePortedWithArgsSigs(byFileName, byNameInPkg, "other.ts", "first")).toEqual([
      sig(0),
      sig(1),
    ]);
  });

  it("returns nothing for a name absent from the package (dep-only methods)", () => {
    expect(resolvePortedWithArgsSigs(byFileName, byNameInPkg, "relation.ts", "presence")).toEqual(
      [],
    );
  });

  it("drops a set accessor's signature, so a get/set pair reads as a zero-arg reader", () => {
    const writerSig = sig(1);
    const pairByFileName = new Map([
      ["relation.ts", new Map([["whereClause", [sig(0), writerSig]]])],
    ]);
    const pairByNameInPkg = new Map([["whereClause", [sig(0), writerSig]]]);
    const writerSigs = new Set<readonly ParamInfo[]>([writerSig]);
    expect(
      resolvePortedWithArgsSigs(
        pairByFileName,
        pairByNameInPkg,
        "relation.ts",
        "whereClause",
        writerSigs,
      ),
    ).toEqual([sig(0)]);
    expect(
      resolvePortedWithArgsSigs(
        pairByFileName,
        pairByNameInPkg,
        "other.ts",
        "whereClause",
        writerSigs,
      ),
    ).toEqual([sig(0)]);
  });
});

describe("significantMissingCalls", () => {
  // mapCall: snake → camel for the cases we test; withArgs: every ported name.
  const map = (rc: string): string[] | null => {
    const camel = rc.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()).replace(/!$/, "Bang");
    return [camel];
  };
  const sig = new Set(["run_callbacks", "save", "transaction"]);

  it("flags a significant Ruby call the TS body omits", () => {
    const missing = significantMissingCalls(
      "update",
      ["save", "assign_attributes"],
      new Set(["assignAttributes"]),
      () => true,
      map,
      sig,
    );
    expect(missing).toEqual(["save → save"]);
  });

  it("ignores idiom calls outside the allowlist (the noise the gate exists for)", () => {
    const missing = significantMissingCalls(
      "build",
      ["each", "map", "new", "to_s"],
      new Set(),
      () => true,
      map,
      sig,
    );
    expect(missing).toEqual([]);
  });

  it("does not flag when the TS body already makes the call", () => {
    const missing = significantMissingCalls(
      "save",
      ["run_callbacks"],
      new Set(["runCallbacks"]),
      () => true,
      map,
      sig,
    );
    expect(missing).toEqual([]);
  });

  it("does not let a sibling call claim a suppressed call's TS spelling", () => {
    const missing = significantMissingCalls(
      "generate_method",
      ["method_defined?", "include?"],
      new Set(["has"]),
      (ts) => ts === "include",
      (rc) => (rc === "method_defined?" ? ["methodDefined"] : ["include"]),
      new Set(["method_defined?", "include?"]),
    );
    expect(missing).toEqual(["include? → include"]);
  });

  it("skips zero-arg readers (callee not a ported method with args)", () => {
    const missing = significantMissingCalls(
      "save",
      ["run_callbacks"],
      new Set(),
      () => false,
      map,
      sig,
    );
    expect(missing).toEqual([]);
  });

  it("skips self/recursive calls", () => {
    const missing = significantMissingCalls("save", ["save"], new Set(), () => true, map, sig);
    expect(missing).toEqual([]);
  });

  it("flags a dropped super-chain, bypassing the ported-with-args gate", () => {
    const sigSuper = new Set(["super"]);
    // isPortedWithArgs always false: super still flags because it bypasses the gate.
    const missing = significantMissingCalls(
      "save",
      ["super"],
      new Set(),
      () => false,
      map,
      sigSuper,
    );
    expect(missing).toEqual(["super → super|save"]);
  });

  it("does not flag super when the TS body chains bare super(...)", () => {
    const sigSuper = new Set(["super"]);
    const missing = significantMissingCalls(
      "save",
      ["super"],
      new Set(["super"]),
      () => false,
      map,
      sigSuper,
    );
    expect(missing).toEqual([]);
  });

  it("does not flag super when the TS body chains super.<sameMethod>()", () => {
    // Ruby bare `super` in `save` ≡ TS `super.save()`, which the extractor
    // records as the method name "save", not "super".
    const sigSuper = new Set(["super"]);
    const missing = significantMissingCalls(
      "save",
      ["super"],
      new Set(["save"]),
      () => false,
      map,
      sigSuper,
    );
    expect(missing).toEqual([]);
  });

  it("wide significant predicate admits every call name except super", () => {
    // RFC 0047 SIGNIFICANT_CALLS shape: `{ has: k => k !== "super" }`.
    const wide = { has: (k: string) => k !== "super" };
    const missing = significantMissingCalls(
      "update",
      ["assign_attributes", "super"],
      new Set(),
      () => true,
      map,
      wide,
    );
    // assign_attributes is flagged (wide admits it though it's outside `sig`);
    // super is structurally excluded even by the wide predicate.
    expect(missing).toEqual(["assign_attributes → assignAttributes"]);
  });

  it("wide predicate suppresses calls whose faithful JS port emits no call", () => {
    // These port to non-call constructs (template literal, for-of, index,
    // property access, truthiness), so no alias can ever match — suppressing
    // them keeps the ratchet from baselining them forever.
    for (const call of NO_JS_CALL_FORM) {
      expect(SIGNIFICANT_CALLS.has(call)).toBe(false);
    }
    expect(SIGNIFICANT_CALLS.has("super")).toBe(false);
    // Every Ruby `synchronize` is a mutex acquisition, and JS has no mutex: the
    // faithful port runs the guarded body with no callee, so no TS body could
    // ever satisfy the call.
    expect(SIGNIFICANT_CALLS.has("synchronize")).toBe(false);
    // Names with a real JS call form must stay significant — suppressing them
    // would hide a genuinely dropped call. `size`/`empty?`/`first`/`last` look
    // like plain Array/property idioms but on a Relation receiver are real
    // query-triggering methods (count/exists?/performFirst/performLast), so the
    // gate must keep watching them.
    for (const call of [
      "delete",
      "merge",
      "fetch",
      "assign_attributes",
      "size",
      "empty?",
      "first",
      "last",
    ]) {
      expect(SIGNIFICANT_CALLS.has(call)).toBe(true);
    }
  });

  it("drops inert-receiver call names", () => {
    // RFC 0083: `xs.first` / `opts.fetch` say nothing about the port, so the
    // gate drops them.
    const calls = ["first", "fetch", "save"];
    const weak = ["first", "fetch"];
    expect(dropWeakCalls(calls, weak)).toEqual(["save"]);
    expect(dropWeakCalls(calls, undefined)).toEqual(calls);
    expect(dropWeakCalls(undefined, weak)).toEqual([]);
  });

  it("compares a fully-weak Ruby body clean instead of dropping it", () => {
    // RFC 0108: every call weak leaves `dropWeakCalls` empty, and checkCalls no
    // longer returns before counting the pair — significantMissingCalls says
    // "nothing missing" for that set, so the pair stays in the population.
    const calls = ["first", "fetch"];
    const rubyCalls = dropWeakCalls(calls, calls);
    expect(rubyCalls).toEqual([]);
    expect(significantMissingCalls("parse", rubyCalls, new Set(), () => true, map, sig)).toEqual(
      [],
    );
  });

  it("suppresses key?/has_key? — an options-hash port tests membership with `in`", () => {
    // Rails `options.key?(:status)` ports to `"status" in options` / `options.status
    // !== undefined`; the idiom table's only JS form is Map#has, which an object
    // literal never calls, so no TS body could ever discharge the flag.
    const missing = significantMissingCalls(
      "_extract_redirect_to_status",
      ["key?", "has_key?", "to_str"],
      new Set(),
      () => true,
      map,
      SIGNIFICANT_CALLS,
    );
    expect(missing).toEqual([]);
  });

  describe("same-file helper extraction", () => {
    // `indexes` factors its work into helpers that live in the same TS file.
    const file = new Map<string, string[]>([
      ["indexes", ["schemaQuery", "buildIndexRows"]],
      ["buildIndexRows", ["map", "indexRowToDefinition"]],
      ["indexRowToDefinition", ["columnNamesFromColumnNumbers"]],
    ]);
    const sameFileCalls = (n: string) => file.get(n);

    it("compares a body against the calls of the helpers it extracted", () => {
      const own = new Set(file.get("indexes"));
      const merged = effectiveTsCalls("indexes", own, () => undefined, sameFileCalls);
      expect(merged).toEqual(
        new Set([
          "schemaQuery",
          "buildIndexRows",
          "map",
          "indexRowToDefinition",
          "columnNamesFromColumnNumbers",
        ]),
      );
    });

    it("does not follow a callee defined in another file", () => {
      const own = new Set(["pgSchemaStatements", "split"]);
      expect(effectiveTsCalls("indexes", own, () => ["neverReached"], sameFileCalls)).toBe(own);
    });

    it("never reaches the package-wide delegate map for a non-wrapper body", () => {
      // The delegate map is unioned by NAME across the whole package, so an
      // unrelated same-named method can satisfy a call. That imprecision is
      // only sound for the forwarder case; a body doing its own work must be
      // held to its own file.
      const own = new Set(file.get("indexes"));
      const merged = effectiveTsCalls("indexes", own, () => ["fromAnotherClass"], sameFileCalls);
      expect(merged.has("fromAnotherClass")).toBe(false);
    });

    it("stops at the closure depth limit", () => {
      const chain = new Map<string, string[]>([
        ["a", ["b"]],
        ["b", ["c"]],
        ["c", ["d"]],
        ["d", ["e"]],
      ]);
      const reached = reachedSameFileMethods("a", ["b"], (n) => chain.get(n));
      expect(reached).toEqual(new Set(["b", "c", "d"]));
    });

    it("terminates on a cycle", () => {
      const cycle = new Map<string, string[]>([
        ["a", ["b"]],
        ["b", ["a", "c"]],
        ["c", ["b"]],
      ]);
      expect(reachedSameFileMethods("a", ["b"], (n) => cycle.get(n))).toEqual(new Set(["b", "c"]));
    });

    it("does not walk into a same-file `constructor` a `new X()` recorded", () => {
      const sameFile = new Map<string, string[]>([
        ["constructor", ["initializeDetails", "buildViewPaths", "detailsKey"]],
        ["detailsKey", ["detailsCacheKey"]],
      ]);
      const own = new Set(["_detailArgsForAny", "_detailsCache", "constructor"]);
      const calls = (n: string) => sameFile.get(n);
      expect(reachedSameFileMethods("detailArgsForAny", own, calls)).toEqual(new Set());
      const tsCalls = effectiveTsCalls("detailArgsForAny", own, () => undefined, calls);
      const missing = significantMissingCalls(
        "detail_args_for_any",
        ["details_cache_key"],
        tsCalls,
        () => true,
        (rc) => (rc === "details_cache_key" ? ["detailsCacheKey"] : null),
        new Set(["details_cache_key"]),
      );
      expect(missing).toEqual(["details_cache_key → detailsCacheKey"]);
    });

    it("does not walk into a same-file `length` an `xs.length` read recorded", () => {
      // relation.ts: `_buildEagerOperandManager` reads `xs.length`, which the
      // extractor records as a call named `length`; resolving it bridged
      // `to_sql` into `Relation#length` (relation/delegation.rb:101) and on to
      // `toArray`'s `withConnection`. Moving `length` to DelegationMethods —
      // RFC 0107 — then reddened `to_sql`, `create_or_find_by` and
      // `apply_join_dependency` with no edit to any of their bodies.
      const sameFile = new Map<string, string[]>([
        ["_buildEagerOperandManager", ["length", "toArel"]],
        ["length", ["toArray"]],
        ["toArray", ["withConnection", "execQueries"]],
      ]);
      const own = new Set(["_buildEagerOperandManager", "_conn", "toArel"]);
      const calls = (n: string) => sameFile.get(n);
      // `xs` is a local, so the extractor marks the read foreign for the owner
      // that made it — which is what stops the walk, no name-list needed.
      const foreign = (owner: string) =>
        owner === "_buildEagerOperandManager" ? ["length"] : undefined;
      const reached = reachedSameFileMethods("toSql", own, calls, SAME_FILE_CLOSURE_DEPTH, foreign);
      expect(reached).toEqual(new Set(["_buildEagerOperandManager"]));
      const tsCalls = effectiveTsCalls("toSql", own, () => undefined, calls, reached);
      expect(tsCalls.has("withConnection")).toBe(false);
      // …and the same body reads identically once `length` leaves the file.
      const moved = (n: string) => (n === "length" ? undefined : sameFile.get(n));
      const movedReached = reachedSameFileMethods(
        "toSql",
        own,
        moved,
        SAME_FILE_CLOSURE_DEPTH,
        foreign,
      );
      expect(effectiveTsCalls("toSql", own, () => undefined, moved, movedReached)).toEqual(tsCalls);
    });

    it("does not walk into a same-file method a `obj.foo` property read recorded", () => {
      const sameFile = new Map<string, string[]>([
        ["locale", ["detailsCacheKey"]],
        ["detailArgsForAny", ["locale", "formats"]],
      ]);
      const own = new Set(["locale", "formats"]);
      const calls = (n: string) => sameFile.get(n);
      const foreign = new Map<string, string[]>([["detailArgsForAny", ["locale", "formats"]]]);
      expect(
        reachedSameFileMethods("detailArgsForAny", own, calls, SAME_FILE_CLOSURE_DEPTH, (owner) =>
          foreign.get(owner),
        ),
      ).toEqual(new Set());
      // The same name called on `this` in the SAME body is the body's own again,
      // so the extractor never marks it and the closure resolves it as before.
      expect(reachedSameFileMethods("detailArgsForAny", own, calls)).toEqual(new Set(["locale"]));
    });

    it("still flags a call no helper in the chain makes", () => {
      const own = new Set(file.get("indexes"));
      const tsCalls = effectiveTsCalls("indexes", own, () => undefined, sameFileCalls);
      const missing = significantMissingCalls(
        "indexes",
        ["unquote_identifier"],
        tsCalls,
        () => true,
        map,
        SIGNIFICANT_CALLS,
      );
      expect(missing).toEqual(["unquote_identifier → unquoteIdentifier"]);
    });
  });

  describe("delegation transparency", () => {
    // PostgreSQLAdapter#indexes is `return this.pgSchemaStatements().indexes(t)`.
    const wrapper = new Set(["indexes", "pgSchemaStatements"]);
    // The real port, in the collaborator the wrapper forwards to.
    const delegate = ["schemaQuery", "map", "join", "columnNamesFromColumnNumbers"];

    it("reads a one-line forwarder as a delegating wrapper", () => {
      expect(isDelegatingWrapper("indexes", wrapper)).toBe(true);
    });

    it("does not read a body doing its own work as a delegating wrapper", () => {
      // A self-named call inside a real body (recursion, or a same-named call on
      // a collected object) must not buy transparency for the rest of the body.
      const own = new Set(["indexes", "schemaQuery", "map", "split", "join"]);
      expect(isDelegatingWrapper("indexes", own)).toBe(false);
    });

    it("does not read a body without a self-named call as a delegating wrapper", () => {
      expect(isDelegatingWrapper("indexes", new Set(["pgSchemaStatements"]))).toBe(false);
    });

    it("stops reading a body as a wrapper past the call-count threshold", () => {
      // The threshold is the whole safety mechanism: it is what keeps a real body
      // that happens to call its own name from buying transparency. Pin both
      // sides of the boundary so widening it is a deliberate edit.
      const atLimit = new Set(["indexes", "pgSchemaStatements", "clearDataSourceCacheBang"]);
      expect(isDelegatingWrapper("indexes", atLimit)).toBe(true);
      expect(isDelegatingWrapper("indexes", new Set([...atLimit, "schemaQuery"]))).toBe(false);
    });

    it("compares a wrapper against the delegate's call-set", () => {
      const merged = effectiveTsCalls("indexes", wrapper, () => delegate);
      // The wrapper's own calls survive; the delegate's are added.
      expect(merged).toEqual(new Set([...wrapper, ...delegate]));
    });

    it("leaves a non-wrapper body's call-set untouched", () => {
      const own = new Set(["indexes", "schemaQuery", "map", "split", "join"]);
      expect(effectiveTsCalls("indexes", own, () => delegate)).toBe(own);
    });

    it("discharges a mixin flag the wrapper drops but the delegate makes", () => {
      // Rails' PostgreSQL::SchemaStatements#indexes is attributed to the
      // INCLUDING class's file, so the gate matches it against the adapter's
      // forwarder. Charging that `return` with the mixin's call set was the bulk
      // of the ratchet expansion #5334's include resolution produced.
      const tsCalls = effectiveTsCalls("indexes", wrapper, () => delegate);
      const missing = significantMissingCalls(
        "indexes",
        ["column_names_from_column_numbers"],
        tsCalls,
        () => true,
        map,
        SIGNIFICANT_CALLS,
      );
      expect(missing).toEqual([]);
    });

    it("still flags a call the delegate omits too", () => {
      // Transparency, not suppression: the delegate is the port, so its own
      // omissions remain the gate's business.
      const tsCalls = effectiveTsCalls("indexes", wrapper, () => delegate);
      const missing = significantMissingCalls(
        "indexes",
        ["unquote_identifier"],
        tsCalls,
        () => true,
        map,
        SIGNIFICANT_CALLS,
      );
      expect(missing).toEqual(["unquote_identifier → unquoteIdentifier"]);
    });
  });

  it("does not flag each — its faithful port is a for-of loop, not a callee", () => {
    // Rails Arel InsertManager#insert iterates with `each`; the trails port
    // uses `for (const x of xs)`, which records no call.
    const missing = significantMissingCalls(
      "insert",
      ["each"],
      new Set(),
      () => true,
      map,
      SIGNIFICANT_CALLS,
    );
    expect(missing).toEqual([]);
  });

  describe("JS enumerable aliases", () => {
    const wide = { has: (k: string) => k !== "super" };

    it("does not flag any? when the TS body calls some", () => {
      // Rails ConnectionPool#connected? → `@connections.any?(&:connected?)`;
      // trails ports it as `_connections.some((c) => c.isConnected())`.
      const missing = significantMissingCalls(
        "connected?",
        ["any?"],
        new Set(["some", "isConnected"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual([]);
    });

    it("does not flag all?/include?/select when the TS body uses the JS analogue", () => {
      const missing = significantMissingCalls(
        "check",
        ["all?", "include?", "select"],
        new Set(["every", "includes", "filter"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual([]);
    });

    it("does not flag match? when the TS body uses RegExp#test", () => {
      const missing = significantMissingCalls(
        "isBigint",
        ["match?"],
        new Set(["test"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual([]);
    });

    it("still flags match? when the TS body makes no matching call", () => {
      const missing = significantMissingCalls(
        "isBigint",
        ["match?"],
        new Set(["includes"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual(["match? → isMatch|match"]);
    });

    it("still flags an enumerable call the TS body makes in no form", () => {
      const missing = significantMissingCalls(
        "check",
        ["any?"],
        new Set(["every"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual(["any? → isAny|any"]);
    });

    it("does not flag exclude?/none? when the TS body negates the analogue", () => {
      // ActiveSupport's `exclude?` is `!include?` and `none?` is `!any?`, so
      // the faithful port is the NEGATED call — the form the extractor records
      // with the `!` marker.
      const missing = significantMissingCalls(
        "check",
        ["exclude?", "none?"],
        new Set(["includes", "some"]),
        () => true,
        rubyMethodToTs,
        wide,
        jsEnumerableAliases,
        new Set(["includes", "some"]),
      );
      expect(missing).toEqual([]);
    });

    it("flags exclude?/none? when the TS body makes the analogue UNnegated", () => {
      // The inverted condition: `xs.includes(y)` where Rails wrote `exclude?`.
      const missing = significantMissingCalls(
        "check",
        ["exclude?", "none?"],
        new Set(["includes", "some"]),
        () => true,
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual(["exclude? → isExclude|exclude|excludes", "none? → isNone|none"]);
    });

    it("marks only aliases the alias table itself lists", () => {
      for (const [rubyCall, negated] of NEGATED_ALIASES) {
        const aliases = JS_ENUMERABLE_ALIASES.get(rubyCall) ?? [];
        expect({ rubyCall, unknown: [...negated].filter((a) => !aliases.includes(a)) }).toEqual({
          rubyCall,
          unknown: [],
        });
      }
    });

    it("partitions the extractor's negation markers out of the plain call-set", () => {
      const { calls, negated } = partitionNegatedCalls(["includes", "!includes", "map"]);
      expect([...calls].sort()).toEqual(["includes", "map"]);
      expect([...negated]).toEqual(["includes"]);
    });

    it("aliases never widen which calls are considered ported", () => {
      // Gate 2 (isPortedWithArgs) sees only the naming-convention candidates,
      // so an alias can never introduce a mismatch that did not exist before.
      const missing = significantMissingCalls(
        "check",
        ["any?"],
        new Set(),
        (c) => c === "some",
        rubyMethodToTs,
        wide,
      );
      expect(missing).toEqual([]);
    });
  });
});

describe("jsEnumerableAliases", () => {
  it("maps the core Ruby Enumerable names to their JS analogues", () => {
    expect(jsEnumerableAliases("any?")).toContain("some");
    expect(jsEnumerableAliases("all?")).toContain("every");
    expect(jsEnumerableAliases("include?")).toContain("has");
    expect(jsEnumerableAliases("select")).toContain("filter");
  });

  it("treats a negated containment call as exclude?'s analogue", () => {
    // ActiveSupport's `exclude?` is `!include?`; ports spell it
    // `!xs.includes(y)` (query-methods.ts) or `!set.has(y)`.
    expect(jsEnumerableAliases("exclude?")).toEqual(["includes", "has"]);
  });

  it("returns an empty list for a name with no JS analogue", () => {
    expect(jsEnumerableAliases("run_callbacks")).toEqual([]);
  });

  it("lists no alias that rubyMethodToTs already produces", () => {
    // A redundant entry (e.g. select → ["select"]) is dead weight that reads
    // as if it were doing work; the convention candidates are checked first.
    for (const [rubyCall, aliases] of JS_ENUMERABLE_ALIASES) {
      const candidates = rubyMethodToTs(rubyCall) ?? [];
      expect({ rubyCall, redundant: aliases.filter((a) => candidates.includes(a)) }).toEqual({
        rubyCall,
        redundant: [],
      });
    }
  });
});

describe("nameMatches", () => {
  it("matches identical names", () => {
    expect(nameMatches("Binary", "Binary")).toBe(true);
  });

  it("matches Ruby error builtins against JS Error", () => {
    expect(nameMatches("StandardError", "Error")).toBe(true);
    expect(nameMatches("ArgumentError", "Error")).toBe(true);
    expect(nameMatches("RangeError", "Error")).toBe(true);
  });

  it("does not match a Ruby non-builtin error name against JS Error", () => {
    expect(nameMatches("ConfigurationError", "Error")).toBe(false);
    expect(nameMatches("ActiveRecordError", "Error")).toBe(false);
  });

  describe("Trails rename conventions", () => {
    it("accepts Abstract<X> (import alias for shadowed parents)", () => {
      // `TableDefinition as AbstractTableDefinition` when a subclass
      // shadows the parent's name.
      expect(nameMatches("TableDefinition", "AbstractTableDefinition")).toBe(true);
      expect(nameMatches("SchemaCreation", "AbstractSchemaCreation")).toBe(true);
    });

    it("accepts Base<X> (intermediate base layer)", () => {
      // Rails has a single class; Trails splits it (BaseLogSubscriber +
      // LogSubscriber, BaseAbsenceValidator + AbsenceValidator, ...).
      expect(nameMatches("LogSubscriber", "BaseLogSubscriber")).toBe(true);
      expect(nameMatches("AbsenceValidator", "BaseAbsenceValidator")).toBe(true);
    });

    it("accepts ActiveModel<X> (aliased to avoid JS builtin collision)", () => {
      // Our Date type extends ActiveModel's Date, aliased on import
      // because the identifier `Date` in the TS file refers to this class.
      expect(nameMatches("Date", "ActiveModelDate")).toBe(true);
      expect(nameMatches("DateTime", "ActiveModelDateTime")).toBe(true);
      expect(nameMatches("Time", "ActiveModelTime")).toBe(true);
    });

    it("accepts <X>Type (suffix to distinguish value vs cast type)", () => {
      // Rails's `Type::Json` value type; our TS class is `JsonType` so
      // the file can still export `Json` as the value constructor.
      expect(nameMatches("Json", "JsonType")).toBe(true);
      expect(nameMatches("Integer", "IntegerType")).toBe(true);
      expect(nameMatches("Binary", "BinaryType")).toBe(true);
    });

    it("rejects unrelated names that happen to share a prefix/suffix", () => {
      // "FooBar" isn't "Abstract" / "Base" / "ActiveModel" + rubyName,
      // nor rubyName + "Type".
      expect(nameMatches("Foo", "FooBar")).toBe(false);
      expect(nameMatches("Foo", "BarFoo")).toBe(false);
    });
  });
});

describe("primaryClassesPerFile", () => {
  const cls = (file: string): ClassInfo => ({
    name: "x",
    file,
    includes: [],
    extends: [],
    instanceMethods: [],
    classMethods: [],
  });

  it("picks the shortest fqn in the file for both selections", () => {
    const { folding, inheritance } = primaryClassesPerFile({
      "A::B": cls("a.rb"),
      "A::B::C": cls("a.rb"),
    });
    expect(folding.get("a.rb")).toBe("A::B");
    expect(inheritance.get("a.rb")).toBe("A::B");
  });

  it("keeps a ruby-only class out of the inheritance selection", () => {
    const { inheritance } = primaryClassesPerFile({
      "I18n::JSON": cls("backend/key_value.rb"),
      "I18n::Backend::KeyValue": cls("backend/key_value.rb"),
      "I18n::Backend::KeyValue::SubtreeProxy": cls("backend/key_value.rb"),
    });
    expect(inheritance.get("backend/key_value.rb")).toBe("I18n::Backend::KeyValue");
  });

  it("keeps the ruby-only class as the folding parent", () => {
    const { folding } = primaryClassesPerFile({
      "I18n::JSON": cls("backend/key_value.rb"),
      "I18n::Backend::KeyValue": cls("backend/key_value.rb"),
      "I18n::Backend::KeyValue::SubtreeProxy": cls("backend/key_value.rb"),
    });
    expect(folding.get("backend/key_value.rb")).toBe("I18n::JSON");
  });

  it("ignores classes with no file", () => {
    const { folding, inheritance } = primaryClassesPerFile({
      "A::B": { ...cls(""), file: undefined },
    });
    expect(folding.size).toBe(0);
    expect(inheritance.size).toBe(0);
  });
});

describe("superclassesMatch", () => {
  it("treats empty ruby super + empty ts chain as matched", () => {
    expect(superclassesMatch(null, [], "Anything")).toBe(true);
  });

  it("matches a `< ::Foo` absolute super against the plain ts name", () => {
    // TS names never carry Ruby's absolute marker, so it is stripped first.
    expect(superclassesMatch("::Binary", ["Binary"], "Cte")).toBe(true);
  });

  it("flags ruby super with empty ts chain", () => {
    expect(superclassesMatch("Foo", [], "Anything")).toBe(false);
  });

  it("matches when ruby super appears anywhere in the ts chain", () => {
    expect(superclassesMatch("Binary", ["Binary"], "Cte")).toBe(true);
    // Trails adds an abstract intermediate; the Ruby parent still
    // shows up in the ts chain.
    expect(
      superclassesMatch("TableDefinition", ["AbstractTableDefinition"], "TableDefinition"),
    ).toBe(true);
  });

  it("matches when ts chain contains a deeper ancestor equal to ruby super", () => {
    // Binary extends NodeExpression extends Node; Rails parent is Binary.
    expect(superclassesMatch("Binary", ["Binary", "NodeExpression", "Node"], "Cte")).toBe(true);
  });

  it("accepts Ruby unextendable builtins regardless of ts chain", () => {
    // Rails SqlLiteral < String — TS can't extend String, but the check
    // still counts it as matched.
    expect(superclassesMatch("String", ["Node", "NodeExpression"], "SqlLiteral")).toBe(true);
    expect(superclassesMatch("Struct", [], "Attribute")).toBe(true);
    // Ruby's `Module` metaprogramming primitive has no TS analog.
    expect(superclassesMatch("Module", [], "InstanceMethodsOnActivation")).toBe(true);
  });

  it("accepts arel Table/Attribute extending Node when Ruby has no super", () => {
    expect(superclassesMatch(null, ["Node"], "Table")).toBe(true);
    expect(superclassesMatch(null, ["Node"], "Attribute")).toBe(true);
  });

  it("accepts activemodel ValueType extending Type when Ruby Value has no super", () => {
    // Rails' `Type::Value` has no super; TS adds an abstract `Type`
    // intermediate so subclasses can declare `abstract cast`.
    expect(superclassesMatch(null, ["Type"], "ValueType")).toBe(true);
  });

  it("accepts AR Base extending Model when Ruby Base has no super", () => {
    // `ActiveRecord::Base` has no Ruby super; TS `Base extends Model`
    // to expose the ActiveModel host class on subclasses.
    expect(superclassesMatch(null, ["Model"], "Base")).toBe(true);
  });

  it("does not auto-accept other classes extending the intermediates with null Ruby super", () => {
    // Only the whitelisted (tsName, intermediate) pairs above are accepted.
    expect(superclassesMatch(null, ["Node"], "Something")).toBe(false);
    expect(superclassesMatch(null, ["Type"], "Something")).toBe(false);
    expect(superclassesMatch(null, ["Model"], "Something")).toBe(false);
  });
});

describe("resolveTsClassForRuby", () => {
  const file = "type/integer.ts";

  it("returns the direct-name match when it has a superclass", () => {
    const direct = cls(file, "Integer", "Value");
    const map = new Map([[`${file}::Integer`, direct]]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(direct);
  });

  it("falls back to an alias match when the direct name is absent", () => {
    const aliased = cls(file, "IntegerType", "ValueType");
    const map = new Map([[`${file}::IntegerType`, aliased]]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(aliased);
  });

  it("prefers an alias match with a super over a direct match without one", () => {
    // Mirrors oid/range.ts: `Range` is a bare bounds helper (no super);
    // `RangeType extends ValueType<Range>` is the real OID cast type.
    const direct = cls("oid/range.ts", "Range"); // no super
    const alias = cls("oid/range.ts", "RangeType", "ValueType");
    const map = new Map([
      ["oid/range.ts::Range", direct],
      ["oid/range.ts::RangeType", alias],
    ]);
    expect(resolveTsClassForRuby("Range", "oid/range.ts", map)).toBe(alias);
  });

  it("keeps the direct match when it has a super, even if an alias also exists", () => {
    const direct = cls(file, "Integer", "Value");
    const alias = cls(file, "IntegerType", "ValueType");
    const map = new Map([
      [`${file}::Integer`, direct],
      [`${file}::IntegerType`, alias],
    ]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(direct);
  });

  it("honors TS_CLASS_RENAMES when neither direct nor alias match (e.g. Registry → TypeRegistry)", () => {
    const renamed = cls("type/registry.ts", "TypeRegistry");
    const map = new Map([["type/registry.ts::TypeRegistry", renamed]]);
    expect(resolveTsClassForRuby("Registry", "type/registry.ts", map)).toBe(renamed);
  });

  it("resolves Railtie → Trailtie (global trailtie convention)", () => {
    const trailtie = cls("trailtie.ts", "Trailtie");
    const map = new Map([["trailtie.ts::Trailtie", trailtie]]);
    expect(resolveTsClassForRuby("Railtie", "trailtie.ts", map)).toBe(trailtie);
  });

  it("resolves Rails → Trails (global trails convention)", () => {
    const trails = cls("rails.ts", "Trails");
    const map = new Map([["rails.ts::Trails", trails]]);
    expect(resolveTsClassForRuby("Rails", "rails.ts", map)).toBe(trails);
  });

  it("returns undefined when nothing resolves", () => {
    expect(resolveTsClassForRuby("Nothing", "nowhere.ts", new Map())).toBeUndefined();
  });
});

describe("methodInMode", () => {
  const method = (internal?: boolean): MethodInfo => ({
    name: "foo",
    visibility: internal ? "private" : "public",
    params: [],
    ...(internal ? { internal: true } : {}),
  });

  it("public mode keeps only public methods (default)", () => {
    expect(methodInMode(method(false), "public")).toBe(true);
    expect(methodInMode(method(true), "public")).toBe(false);
  });

  it("private mode keeps only internal methods (--privates-only)", () => {
    expect(methodInMode(method(true), "private")).toBe(true);
    expect(methodInMode(method(false), "private")).toBe(false);
  });

  it("all mode keeps both public and internal methods (--privates)", () => {
    expect(methodInMode(method(true), "all")).toBe(true);
    expect(methodInMode(method(false), "all")).toBe(true);
  });

  it("treats missing internal flag as public", () => {
    // Legacy fixture manifests may not set `internal` at all; those
    // methods must count toward the public surface, not drop out.
    const bare: MethodInfo = { name: "x", visibility: "public", params: [] };
    expect(methodInMode(bare, "public")).toBe(true);
    expect(methodInMode(bare, "private")).toBe(false);
    expect(methodInMode(bare, "all")).toBe(true);
  });
});

describe("tsShouldIncludeInIndex", () => {
  // When --privates-only is active, a Ruby private method implemented as an
  // exported (public) TS function must still count as matched.
  // When default/public mode is active, internal TS methods must NOT satisfy
  // Ruby public method coverage (would inflate scores).
  // When --privates (all) is active, the full combined surface is shown, so
  // internal TS methods should also be included.

  const pub: MethodInfo = { name: "foo", visibility: "public", params: [] };
  const internal: MethodInfo = {
    name: "bar",
    visibility: "private",
    internal: true,
    params: [],
  };

  it("private mode includes both public and internal TS methods", () => {
    expect(tsShouldIncludeInIndex(pub, "private")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "private")).toBe(true);
  });

  it("public mode excludes internal TS methods", () => {
    expect(tsShouldIncludeInIndex(pub, "public")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "public")).toBe(false);
  });

  it("all mode includes both public and internal TS methods (full surface)", () => {
    expect(tsShouldIncludeInIndex(pub, "all")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "all")).toBe(true);
  });
});

describe("flattenIncludedMethodInfos", () => {
  function im(name: string): MethodInfo {
    return { name, visibility: "public", params: [] };
  }
  function mod(name: string, instance: string[], includes: string[] = []): ClassInfo {
    return {
      name,
      file: `${name.toLowerCase()}.rb`,
      includes,
      extends: [],
      instanceMethods: instance.map(im),
      classMethods: [],
    };
  }

  it("flattens included module instance methods onto the host", () => {
    // Mirrors arel #814: NodeExpression includes Predications + Math.
    // Without flattening, NodeExpression's expected surface is empty
    // and the wiring gap goes undetected.
    const predications = mod("Predications", ["eq", "gt", "lt"]);
    const math = mod("Math", ["add", "subtract"]);
    const host: ClassInfo = {
      name: "NodeExpression",
      file: "arel/nodes/node_expression.rb",
      includes: ["Predications", "Math"],
      extends: [],
      instanceMethods: [im("hash")],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: { "Arel::Nodes::NodeExpression": host },
      modules: { "Arel::Predications": predications, "Arel::Math": math },
    };
    const byShort = new Map([
      ["Predications", ["Arel::Predications"]],
      ["Math", ["Arel::Math"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Arel::Nodes::NodeExpression", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(
      ["add", "eq", "gt", "hash", "lt", "subtract"].sort(),
    );
    expect(f.klass).toEqual([]);
  });

  it("routes `extend` modules' instance methods as class methods on the host", () => {
    const enums = mod("Enum", ["values", "lookup"]);
    const host: ClassInfo = {
      name: "Base",
      file: "base.rb",
      includes: [],
      extends: ["Enum"],
      instanceMethods: [],
      classMethods: [im("inherited")],
    };
    const pkg: PackageInfo = {
      classes: { Base: host },
      modules: { Enum: enums },
    };
    const byShort = new Map([["Enum", ["Enum"]]]);
    const f = flattenIncludedMethodInfos(host, "Base", pkg, byShort);
    expect(f.instance.map((m) => m.name)).toEqual([]);
    expect(f.klass.map((m) => m.name).sort()).toEqual(["inherited", "lookup", "values"]);
  });

  it("recurses through nested module includes", () => {
    // Predications includes Constants → Constants's methods reach the host.
    const constants = mod("Constants", ["null", "true_value"]);
    const predications = mod("Predications", ["eq"], ["Constants"]);
    const host: ClassInfo = {
      name: "Attribute",
      file: "arel/attribute.rb",
      includes: ["Predications"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: { "Arel::Predications": predications, "Arel::Constants": constants },
    };
    const byShort = new Map([
      ["Predications", ["Arel::Predications"]],
      ["Constants", ["Arel::Constants"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Arel::Attribute", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["eq", "null", "true_value"]);
  });

  it("does not propagate a module's own `extend` through `include` chains", () => {
    // Ruby `extend X` affects only the receiver's singleton class. A
    // module that does `extend ActiveSupport::Concern` does NOT donate
    // Concern's methods to a class that does `include` the module.
    // (Rails' "class methods via include" pattern is ASC's nested
    // ClassMethods submodule, folded in by compare.ts upstream.)
    const concern = mod("Concern", ["append_features", "included"]);
    const myConcern = mod("MyConcern", ["instance_helper"]);
    myConcern.extends = ["Concern"];
    const host: ClassInfo = {
      name: "Host",
      file: "host.rb",
      includes: ["MyConcern"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: { Concern: concern, MyConcern: myConcern },
    };
    const byShort = new Map([
      ["Concern", ["Concern"]],
      ["MyConcern", ["MyConcern"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Host", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["instance_helper"]);
    expect(f.klass).toEqual([]);
  });

  it("skips modules outside the package without erroring", () => {
    // Comparable, Enumerable etc. live in stdlib — not in our manifest.
    const host: ClassInfo = {
      name: "Range",
      file: "range.rb",
      includes: ["Comparable", "Enumerable"],
      extends: [],
      instanceMethods: [im("first")],
      classMethods: [],
    };
    const pkg: PackageInfo = { classes: {}, modules: {} };
    const f = flattenIncludedMethodInfos(host, "Range", pkg, new Map());
    expect(f.instance.map((m) => m.name)).toEqual(["first"]);
  });

  it("skips included modules whose source file is unported", () => {
    // A module we've explicitly declined to port (matches an UNPORTED_FILES
    // pattern) must not leak its methods onto includers. Mirrors
    // Railties::ControllerRuntime — included into ActionController via an
    // `on_load` block, not into Railtie — which otherwise leaked
    // `initialize`/`process_action` onto the Railtie host.
    const ported = mod("Ported", ["keep_me"]);
    const unported = mod("Promise", ["value", "then"]); // file: promise.rb (unported)
    const host: ClassInfo = {
      name: "Host",
      file: "host.rb",
      includes: ["Ported", "Promise"],
      extends: [],
      instanceMethods: [im("own")],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: { Ported: ported, Promise: unported },
    };
    const byShort = new Map([
      ["Ported", ["Ported"]],
      ["Promise", ["Promise"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Host", pkg, byShort, "activerecord");
    expect(f.instance.map((m) => m.name).sort()).toEqual(["keep_me", "own"]);
  });

  it("guards against include cycles between modules", () => {
    const a = mod("A", ["a1"], ["B"]);
    const b = mod("B", ["b1"], ["A"]);
    const host: ClassInfo = {
      name: "Host",
      file: "host.rb",
      includes: ["A"],
      extends: [],
      instanceMethods: [im("h1")],
      classMethods: [],
    };
    const pkg: PackageInfo = { classes: {}, modules: { A: a, B: b } };
    const byShort = new Map([
      ["A", ["A"]],
      ["B", ["B"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Host", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["a1", "b1", "h1"]);
  });

  it("scopes include resolution to host namespace — base Quoting, not adapter siblings", () => {
    // AbstractAdapter includes "Quoting". Ruby resolves to the base
    // ConnectionAdapters::Quoting, NOT to PostgreSQL::Quoting or MySQL::Quoting.
    const baseQuoting = mod("Quoting", ["quote", "quoteColumnName"]);
    const pgQuoting = mod("PostgreSQL::Quoting", ["escapeBytea", "quoteSchemaName"]);
    const mysqlQuoting = mod("MySQL::Quoting", ["unquotedBool"]);
    const host: ClassInfo = {
      name: "AbstractAdapter",
      file: "connection_adapters/abstract_adapter.rb",
      includes: ["Quoting"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: {
        "ActiveRecord::ConnectionAdapters::Quoting": baseQuoting,
        "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting": pgQuoting,
        "ActiveRecord::ConnectionAdapters::MySQL::Quoting": mysqlQuoting,
      },
    };
    const byShort = new Map([
      [
        "Quoting",
        [
          "ActiveRecord::ConnectionAdapters::Quoting",
          "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting",
          "ActiveRecord::ConnectionAdapters::MySQL::Quoting",
        ],
      ],
    ]);
    const f = flattenIncludedMethodInfos(
      host,
      "ActiveRecord::ConnectionAdapters::AbstractAdapter",
      pkg,
      byShort,
    );
    // Should only get base Quoting methods, NOT PG or MySQL specifics
    expect(f.instance.map((m) => m.name).sort()).toEqual(["quote", "quoteColumnName"]);
  });

  it("scopes include resolution to adapter namespace — adapter-specific Quoting", () => {
    // PostgreSQLAdapter includes "Quoting". Ruby resolves to PostgreSQL::Quoting.
    const baseQuoting = mod("Quoting", ["quote", "quoteColumnName"]);
    const pgQuoting = mod("PostgreSQL::Quoting", ["escapeBytea", "quoteSchemaName"]);
    const host: ClassInfo = {
      name: "PostgreSQLAdapter",
      file: "connection_adapters/postgresql_adapter.rb",
      includes: ["Quoting"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: {
        "ActiveRecord::ConnectionAdapters::Quoting": baseQuoting,
        "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting": pgQuoting,
      },
    };
    const byShort = new Map([
      [
        "Quoting",
        [
          "ActiveRecord::ConnectionAdapters::Quoting",
          "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting",
        ],
      ],
    ]);
    const f = flattenIncludedMethodInfos(
      host,
      "ActiveRecord::ConnectionAdapters::PostgreSQL::PostgreSQLAdapter",
      pkg,
      byShort,
    );
    // Should resolve to PostgreSQL::Quoting, not the base abstract Quoting
    expect(f.instance.map((m) => m.name).sort()).toEqual(["escapeBytea", "quoteSchemaName"]);
  });
});

describe("resolveEntityByDeclaringFile", () => {
  const entity = (file: string, name = "SchemaStatements"): ClassInfo => ({
    name,
    file,
    includes: [],
    extends: [],
    instanceMethods: [],
    classMethods: [],
  });

  it("returns the sole candidate without consulting the declaring file", () => {
    const only = entity("connection-adapters/abstract/schema-statements.ts");
    expect(resolveEntityByDeclaringFile([only], "connection-adapters/sqlite3/adapter.ts")).toBe(
      only,
    );
  });

  it("returns null when nothing shares the short name", () => {
    expect(resolveEntityByDeclaringFile([], "a.ts", "b.ts")).toBeNull();
  });

  it("prefers the candidate whose file the extends clause resolved to", () => {
    // Proximity alone picks the sibling under `postgresql/`; the recorded
    // declaring file says the `extends` actually bound the abstract one.
    const abstract = entity("connection-adapters/abstract/schema-statements.ts");
    const postgresql = entity("connection-adapters/postgresql/schema-statements.ts");
    expect(
      resolveEntityByDeclaringFile(
        [abstract, postgresql],
        "connection-adapters/postgresql/adapter.ts",
        "connection-adapters/abstract/schema-statements.ts",
      ),
    ).toBe(abstract);
  });

  it("falls back to path proximity when no declaring file was recorded", () => {
    const abstract = entity("connection-adapters/abstract/schema-statements.ts");
    const sqlite3 = entity("connection-adapters/sqlite3/schema-statements.ts");
    expect(
      resolveEntityByDeclaringFile([abstract, sqlite3], "connection-adapters/sqlite3/adapter.ts"),
    ).toBe(sqlite3);
  });

  it("falls back to path proximity when the declaring file matches no candidate", () => {
    const abstract = entity("connection-adapters/abstract/schema-statements.ts");
    const sqlite3 = entity("connection-adapters/sqlite3/schema-statements.ts");
    expect(
      resolveEntityByDeclaringFile(
        [abstract, sqlite3],
        "connection-adapters/sqlite3/adapter.ts",
        "some/other/package/schema-statements.ts",
      ),
    ).toBe(sqlite3);
  });

  it("skips the child's own file when scoring proximity", () => {
    // A class and its same-named parent can't share a file, so a candidate at
    // the child's path is the child itself — picking it would loop.
    const self = entity("connection-adapters/sqlite3/adapter.ts");
    const parent = entity("connection-adapters/abstract/adapter.ts");
    expect(
      resolveEntityByDeclaringFile([self, parent], "connection-adapters/sqlite3/adapter.ts"),
    ).toBe(parent);
  });
});

describe("resolveModuleName", () => {
  it("disambiguates a duplicated short name by namespace, needing no declaring file", () => {
    // The Ruby-side counterpart of `resolveEntityByDeclaringFile`: same
    // `SchemaStatements` collision across sibling adapters, resolved by the
    // enclosing namespace the way Ruby's own constant lookup does. This is why
    // the include-graph walks (`buildModuleIncluderFqns`,
    // `flattenIncludedMethodInfos`, extra-surface's `walkMixin`) don't take a
    // declaring-file hint.
    const byShort = new Map([
      [
        "SchemaStatements",
        [
          "AR::ConnectionAdapters::SchemaStatements",
          "AR::ConnectionAdapters::PostgreSQL::SchemaStatements",
          "AR::ConnectionAdapters::SQLite3::SchemaStatements",
        ],
      ],
    ]);
    expect(
      resolveModuleName(
        "SchemaStatements",
        "AR::ConnectionAdapters::SQLite3::SQLite3Adapter",
        byShort,
      ),
    ).toEqual("AR::ConnectionAdapters::SQLite3::SchemaStatements");
  });

  it("returns the single candidate unchanged", () => {
    const byShort = new Map([["Quoting", ["AR::ConnectionAdapters::Quoting"]]]);
    expect(
      resolveModuleName("Quoting", "AR::ConnectionAdapters::AbstractAdapter", byShort),
    ).toEqual("AR::ConnectionAdapters::Quoting");
  });

  it("falls back to the verbatim qualified name when nothing matches", () => {
    expect(resolveModuleName("Foo::Bar", "Baz::Qux", new Map())).toEqual("Foo::Bar");
  });

  it("resolves a partially-qualified name through the enclosing namespace", () => {
    const byShort = new Map([["Quoting", ["AR::ConnectionAdapters::PostgreSQL::Quoting"]]]);
    expect(
      resolveModuleName(
        "PostgreSQL::Quoting",
        "AR::ConnectionAdapters::PostgreSQLAdapter",
        byShort,
      ),
    ).toEqual("AR::ConnectionAdapters::PostgreSQL::Quoting");
  });

  it("returns a fully-qualified name that already matches a known module", () => {
    const byShort = new Map([
      ["Quoting", ["AR::ConnectionAdapters::PostgreSQL::Quoting", "Other::Quoting"]],
    ]);
    expect(
      resolveModuleName("Other::Quoting", "AR::ConnectionAdapters::PostgreSQLAdapter", byShort),
    ).toEqual("Other::Quoting");
  });

  it("prefers the nearest namespace prefix over a top-level qualified match", () => {
    const byShort = new Map([
      ["Quoting", ["PostgreSQL::Quoting", "AR::ConnectionAdapters::PostgreSQL::Quoting"]],
    ]);
    expect(
      resolveModuleName(
        "PostgreSQL::Quoting",
        "AR::ConnectionAdapters::PostgreSQLAdapter",
        byShort,
      ),
    ).toEqual("AR::ConnectionAdapters::PostgreSQL::Quoting");
  });

  it("returns the verbatim qualified name when no namespace prefix matches", () => {
    const byShort = new Map([["Quoting", ["Somewhere::Else::Quoting"]]]);
    expect(resolveModuleName("PostgreSQL::Quoting", "AR::Base", byShort)).toEqual(
      "PostgreSQL::Quoting",
    );
  });

  it("strips a leading :: and resolves top-level, ignoring nearer candidates", () => {
    // `include ::Foo` is absolute: it must not bind to the lexically nearer
    // `Z::Foo` the unqualified form would pick.
    const byShort = new Map([["Foo", ["Z::Foo", "Foo"]]]);
    expect(resolveModuleName("::Foo", "Z::Bar", byShort)).toEqual("Foo");
  });

  it("strips a leading :: from a qualified absolute name", () => {
    expect(resolveModuleName("::Foo::Bar", "Baz::Qux", new Map())).toEqual("Foo::Bar");
  });

  it("returns the top-level reading when context has no prefix match", () => {
    // Ruby binds one constant, never every same-named candidate: handing back
    // both would give `Z::Bar` X::Foo's *and* Y::Foo's methods as expected
    // surface, and both modules' includer files as legal homes for them.
    const byShort = new Map([["Foo", ["X::Foo", "Y::Foo"]]]);
    expect(resolveModuleName("Foo", "Z::Bar", byShort)).toEqual("Foo");
  });

  it("binds the nearest enclosing candidate or top-level, never an unrelated sibling", () => {
    // Whatever the context, the binding is the innermost enclosing namespace
    // that defines `Foo`, else top-level `Foo` — never a candidate the context
    // does not enclose. `Y::Foo` is unreachable from every context here.
    const byShort = new Map([["Foo", ["X::Foo", "Y::Foo", "X::Y::Foo"]]]);
    expect(resolveModuleName("Foo", "X::Y::Bar", byShort)).toEqual("X::Y::Foo");
    expect(resolveModuleName("Foo", "X::Bar", byShort)).toEqual("X::Foo");
    expect(resolveModuleName("Foo", "Z::Bar", byShort)).toEqual("Foo");
    expect(resolveModuleName("Foo", "A::B::C::D", byShort)).toEqual("Foo");
  });

  it("prefers nearest namespace prefix — abstract base wins over sibling adapter", () => {
    const candidates = [
      "AR::ConnectionAdapters::Quoting",
      "AR::ConnectionAdapters::PostgreSQL::Quoting",
      "AR::ConnectionAdapters::MySQL::Quoting",
    ];
    const byShort = new Map([["Quoting", candidates]]);
    const result = resolveModuleName("Quoting", "AR::ConnectionAdapters::AbstractAdapter", byShort);
    expect(result).toEqual("AR::ConnectionAdapters::Quoting");
  });

  it("prefers adapter-specific namespace when including class is in that namespace", () => {
    const candidates = [
      "AR::ConnectionAdapters::Quoting",
      "AR::ConnectionAdapters::PostgreSQL::Quoting",
    ];
    const byShort = new Map([["Quoting", candidates]]);
    const result = resolveModuleName(
      "Quoting",
      "AR::ConnectionAdapters::PostgreSQL::PostgreSQLAdapter",
      byShort,
    );
    expect(result).toEqual("AR::ConnectionAdapters::PostgreSQL::Quoting");
  });

  it("binds a class's own nested module over an identically-named sibling's", () => {
    // `class Rack::Request; include Helpers; end` where both Request and
    // Response nest a `Helpers`: Ruby binds Request's.
    const byShort = new Map([["Helpers", ["Rack::Request::Helpers", "Rack::Response::Helpers"]]]);
    expect(resolveModuleName("Helpers", "Rack::Request", byShort)).toEqual(
      "Rack::Request::Helpers",
    );
    expect(resolveModuleName("Helpers", "Rack::Response::Raw", byShort)).toEqual(
      "Rack::Response::Helpers",
    );
  });
});

describe("buildModuleIncluderFqns", () => {
  function entity(name: string, includes: string[] = [], extendsList: string[] = []): ClassInfo {
    return {
      name: name.split("::").pop()!,
      file: `${name.split("::").pop()!.toLowerCase()}.rb`,
      includes,
      extends: extendsList,
      instanceMethods: [],
      classMethods: [],
    };
  }

  const byShort = new Map([
    ["Helpers", ["Rack::Request::Helpers", "Rack::Response::Helpers"]],
    ["Env", ["Rack::Request::Env"]],
  ]);

  it("registers an includer only against the module Ruby's lookup binds", () => {
    // Regression: resolving unqualified names against the raw short-name map
    // registered Rack::Request as an includer of Rack::Response::Helpers,
    // which made response.ts an implementation site for Request's headers.
    const graph = buildModuleIncluderFqns(
      [
        { fqn: "Rack::Request", info: entity("Rack::Request", ["Env", "Helpers"]) },
        { fqn: "Rack::Response", info: entity("Rack::Response", ["Helpers"]) },
      ],
      byShort,
    );
    expect([...(graph.get("Rack::Request::Helpers") ?? [])]).toEqual(["Rack::Request"]);
    expect([...(graph.get("Rack::Response::Helpers") ?? [])]).toEqual(["Rack::Response"]);
    expect([...(graph.get("Rack::Request::Env") ?? [])]).toEqual(["Rack::Request"]);
  });

  it("registers extends alongside includes and keeps unknown names verbatim", () => {
    const graph = buildModuleIncluderFqns(
      [{ fqn: "Rack::Request", info: entity("Rack::Request", ["Helpers"], ["Comparable"]) }],
      byShort,
    );
    expect([...(graph.get("Comparable") ?? [])]).toEqual(["Rack::Request"]);
    expect(graph.has("Rack::Response::Helpers")).toBe(false);
  });
});

describe("dedupeRubyMethodInto", () => {
  function rm(name: string): MethodInfo {
    return {
      name,
      visibility: "public",
      params: [],
      isStatic: false,
      file: "x.rb",
      line: 1,
    };
  }

  it("retains distinct Ruby methods even when their first TS candidates collide", () => {
    // Regression: previous dedup keyed on the first TS candidate, so
    // `is_number?` and `number?` (both → "isNumber") collapsed silently.
    // Keying by Ruby name keeps them as two distinct expected entries.
    const seen = new Map<string, { rubyName: string; rubyModule: string }>();
    dedupeRubyMethodInto(seen, rm("is_number?"), "ActiveModel::Validations::Numericality");
    dedupeRubyMethodInto(seen, rm("number?"), "ActiveModel::Validations::Numericality");
    expect([...seen.values()].map((v) => v.rubyName).sort()).toEqual(["is_number?", "number?"]);
  });

  it("still dedups true repeats of the same Ruby method (e.g. subclass overrides)", () => {
    // Multiple subclasses in one file overriding `invert` should count
    // once — the original behavior the dedup was designed for.
    const seen = new Map<string, { rubyName: string; rubyModule: string }>();
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::A");
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::B");
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::C");
    expect(seen.size).toBe(1);
    // First insertion wins, so the FQN points at the first observer.
    expect([...seen.values()][0]).toEqual({
      rubyName: "invert",
      rubyModule: "Foo::A",
      definedInFile: "x.rb",
    });
  });
});

describe("rubyFileHasTsCounterpart", () => {
  it("is true when the mirrored TS file exists", () => {
    expect(rubyFileHasTsCounterpart(true, null)).toBe(true);
  });

  it("is true when the port landed in the sibling file the misplaced vote found", () => {
    expect(rubyFileHasTsCounterpart(false, "core-ext/object/blank.ts")).toBe(true);
  });

  it("is false for a Ruby file with no port anywhere, so its members cannot be credited cross-file", () => {
    expect(rubyFileHasTsCounterpart(false, null)).toBe(false);
  });
});

describe("selectMisplacedFile", () => {
  function hits(...entries: [string, number][]): Map<string, number> {
    return new Map(entries);
  }

  it("returns null when no file has any hits", () => {
    expect(selectMisplacedFile(hits(), 10)).toBeNull();
  });

  it("returns null below the absolute hit floor", () => {
    // 2 hits, 2 expected methods → 100% coverage and 2× over zero
    // runner-up, but absolute floor is MISPLACED_MIN_HITS=3.
    expect(selectMisplacedFile(hits(["a.ts", 2]), 2)).toBeNull();
    expect(MISPLACED_MIN_HITS).toBe(3);
  });

  it("returns null when coverage is below 50%", () => {
    // 3 hits but ruby file has 7 methods → 43% coverage. This is the
    // exact `deprecator.rb ↦ migration.ts` false-positive shape.
    expect(selectMisplacedFile(hits(["migration.ts", 3]), 7)).toBeNull();
  });

  it("returns null when leader is not 2× the runner-up", () => {
    // 3 hits leader, 2 hits runner-up → leader < 2×, ambiguous.
    const result = selectMisplacedFile(hits(["a.ts", 3], ["b.ts", 2]), 6);
    expect(result).toBeNull();
  });

  it("returns the cluster file when all three thresholds pass", () => {
    // 5 hits in app-generator.ts out of 8 expected methods → 62%
    // coverage, ≥3 absolute, runner-up only 1.
    const result = selectMisplacedFile(hits(["app-generator.ts", 5], ["other.ts", 1]), 8);
    expect(result).toBe("app-generator.ts");
  });

  it("picks the file with the highest count when several are tied at low values", () => {
    // Pure tie at the noise floor → still null because no separation.
    const result = selectMisplacedFile(hits(["a.ts", 3], ["b.ts", 3], ["c.ts", 3]), 6);
    expect(result).toBeNull();
  });

  it("never resolves onto the package barrel", () => {
    // The barrel re-exports the whole package, so it out-hits every real file
    // and would clear all three thresholds. It is a re-export site, not a port
    // location — PR #6225's `acts_like.rb ↦ activesupport/src/index.ts`.
    expect(selectMisplacedFile(hits(["index.ts", 8], ["a.ts", 1]), 10)).toBeNull();
  });

  it("lets a real cluster win once the barrel is dropped from the vote", () => {
    // Without the exclusion the barrel takes it at 9; with it, object.ts is the
    // leader and its runner-up is the noise floor, not the barrel.
    const result = selectMisplacedFile(hits(["index.ts", 9], ["object.ts", 6], ["b.ts", 1]), 10);
    expect(result).toBe("object.ts");
  });

  it("keeps a directory barrel in the vote", () => {
    // Only the package-src root `index.ts` is a pure re-export site; nested
    // `.../index.ts` files (encryption/index.ts) carry ported bodies.
    const result = selectMisplacedFile(hits(["encryption/index.ts", 6], ["b.ts", 1]), 10);
    expect(result).toBe("encryption/index.ts");
  });

  it("never clusters a bucket registered as a name collision", () => {
    for (const bucketKey of NAME_COLLISION_CLUSTERS) {
      expect(
        selectMisplacedFile(hits(["deprecation.ts", 6], ["b.ts", 1]), 10, bucketKey),
      ).toBeNull();
    }
    // Only-shrink registry: `activesupport:deprecation/deprecators.rb` left it
    // when `deprecation/deprecators.ts` landed, so it is now empty.
    expect(NAME_COLLISION_CLUSTERS.has("activesupport:deprecation/deprecators.rb")).toBe(false);
    expect(NAME_COLLISION_CLUSTERS.size).toBe(0);
  });

  it("leaves an unregistered bucket's cluster alone", () => {
    expect(
      selectMisplacedFile(
        hits(["deprecation.ts", 6], ["b.ts", 1]),
        10,
        "activesupport:deprecation/behaviors.rb",
      ),
    ).toBe("deprecation.ts");
  });

  it("accepts a clear leader even with multiple low-hit competitors", () => {
    // 6/10 hits in winner, scattered noise elsewhere.
    const result = selectMisplacedFile(
      hits(["winner.ts", 6], ["a.ts", 1], ["b.ts", 1], ["c.ts", 1]),
      10,
    );
    expect(result).toBe("winner.ts");
  });
});

describe("buildEntitiesByName", () => {
  it("includes entities from the current package", () => {
    const base = cls("packages/activerecord/src/base.ts", "Base");
    const ts = makeManifest({ activerecord: { classes: { Base: base } } });
    const map = buildEntitiesByName("activerecord", ts);
    expect(map.get("Base")).toContain(base);
  });

  it("includes entities from @blazetrails/* dep packages when package.json lists them", () => {
    // activerecord depends on activemodel; Model lives in activemodel.
    const model = cls("packages/activemodel/src/model.ts", "Model");
    model.instanceMethods = [method("attributes")];

    const base = cls("packages/activerecord/src/base.ts", "Base");
    base.superclass = "Model";

    const ts = makeManifest({
      activerecord: { classes: { Base: base } },
      activemodel: { classes: { Model: model } },
    });

    // activerecord's real package.json includes @blazetrails/activemodel,
    // so buildEntitiesByName should pull in Model from activemodel.
    const map = buildEntitiesByName("activerecord", ts);
    const modelCandidates = map.get("Model") ?? [];
    expect(modelCandidates).toContain(model);
  });

  it("does not add dep-package entities for a package with no blazetrails deps (e.g. activesupport)", () => {
    const concern = cls("packages/activesupport/src/concern.ts", "Concern");
    const ts = makeManifest({
      activesupport: { classes: { Concern: concern } },
      activemodel: { classes: { Model: cls("packages/activemodel/src/model.ts", "Model") } },
    });

    const map = buildEntitiesByName("activesupport", ts);
    // activesupport's package.json has no @blazetrails/* deps, so Model must not appear.
    expect(map.has("Model")).toBe(false);
  });

  it("excludes __fixtures__ and tsc-wrapper stubs so they don't shadow real dep-package entities", () => {
    // activerecord tsc-wrapper fixtures contain a stub Model with 1 method;
    // the real Model in activemodel has many methods. Fixtures must be skipped.
    const stubModel = cls("tsc-wrapper/__fixtures__/base.ts", "Model");
    stubModel.instanceMethods = [method("stub")];
    const realModel = cls("model.ts", "Model");
    realModel.instanceMethods = [method("attributes"), method("readAttribute")];

    const ts = makeManifest({
      activerecord: { classes: { StubModel: stubModel } },
      activemodel: { classes: { Model: realModel } },
    });

    const map = buildEntitiesByName("activerecord", ts);
    const candidates = map.get("Model") ?? [];
    expect(candidates).toContain(realModel);
    expect(candidates).not.toContain(stubModel);
  });

  it("current-package entities appear before dep-package entities (same name)", () => {
    const localModel = cls("packages/activerecord/src/model.ts", "Model");
    const depModel = cls("packages/activemodel/src/model.ts", "Model");
    const ts = makeManifest({
      activerecord: { classes: { LocalModel: localModel } },
      activemodel: { classes: { Model: depModel } },
    });
    // Override localModel name so both share the key "Model"
    localModel.name = "Model";

    const map = buildEntitiesByName("activerecord", ts);
    const candidates = map.get("Model") ?? [];
    // Local should be first (added first due to current-package priority)
    expect(candidates[0]).toBe(localModel);
  });
});

describe("blazetrailsDepKeys", () => {
  it("keeps a package that shares its dir with a test-support package", () => {
    // `@blazetrails/activerecord` maps to both `activerecord` and
    // `activerecord-test-support`; the lib package must survive the split.
    expect(blazetrailsDepKeys("trailties")).toContain("activerecord");
  });

  it("never exposes a test-support package to its siblings", () => {
    for (const pkg of ["trailties", "activerecord", "actioncontroller"]) {
      expect(blazetrailsDepKeys(pkg)).not.toContain("activerecord-test-support");
    }
  });

  it("gives a test-support package its container as a dep", () => {
    // The helpers live in the container's npm package, so it is never listed
    // in package.json — without this, FakeAdapter's superclass resolves to
    // nothing.
    expect(blazetrailsDepKeys("activerecord-test-support")).toContain("activerecord");
  });
});

describe("suppressTaggedCalls", () => {
  it("drops a flagged call the declaration tags and records it as used", () => {
    const used = new Set<string>();
    const kept = suppressTaggedCalls(
      ["synchronize → synchronize", "reload → reload"],
      new Set(["synchronize"]),
      used,
    );
    expect(kept).toEqual(["reload → reload"]);
    expect([...used]).toEqual(["synchronize"]);
  });

  it("does not silence a call the tag does not name", () => {
    const used = new Set<string>();
    expect(suppressTaggedCalls(["reload → reload"], new Set(["synchronize"]), used)).toEqual([
      "reload → reload",
    ]);
    expect([...used]).toEqual([]);
  });
});

describe("staleCallTags", () => {
  const tags = new Map([
    [
      "relation.ts",
      new Map([["load", new Map([["Relation", new Set(["synchronize", "reload"])]])]]),
    ],
  ]);

  it("reports a tag whose call no longer flags on a compared method", () => {
    const used = new Map([
      [callTagKey("relation.ts", "Relation", "load"), new Set(["synchronize"])],
    ]);
    expect(staleCallTags(tags, used)).toEqual([
      { tsFile: "relation.ts", tsName: "load", call: "reload" },
    ]);
  });

  it("reports nothing while every tag still suppresses", () => {
    const used = new Map([
      [callTagKey("relation.ts", "Relation", "load"), new Set(["synchronize", "reload"])],
    ]);
    expect(staleCallTags(tags, used)).toEqual([]);
  });

  it("stays silent about a method no matched pair compared", () => {
    expect(staleCallTags(tags, new Map())).toEqual([]);
  });

  it("keys tags to their own file, so a same-named method elsewhere is untouched", () => {
    const twoFiles = new Map([
      ["relation.ts", new Map([["load", new Map([["Relation", new Set(["synchronize"])]])]])],
      ["core.ts", new Map([["load", new Map([["Core", new Set(["synchronize"])]])]])],
    ]);
    const used = new Map([[callTagKey("core.ts", "Core", "load"), new Set<string>()]]);
    expect(staleCallTags(twoFiles, used)).toEqual([
      { tsFile: "core.ts", tsName: "load", call: "synchronize" },
    ]);
  });

  it("keys tags to their own class, so a sibling in the same file is untouched", () => {
    const twoClasses = new Map([
      [
        "connection-pool.ts",
        new Map([
          [
            "checkout",
            new Map([
              ["ConnectionPool", new Set(["synchronize"])],
              ["NullPool", new Set(["synchronize"])],
            ]),
          ],
        ]),
      ],
    ]);
    const used = new Map([
      [callTagKey("connection-pool.ts", "ConnectionPool", "checkout"), new Set(["synchronize"])],
    ]);
    expect(staleCallTags(twoClasses, used)).toEqual([]);
  });
});

describe("resolveTsOwner", () => {
  it("takes the sole declaring class without consulting the Ruby name", () => {
    expect(resolveTsOwner(new Set(["ConnectionPool"]), "ActiveRecord::Base")).toBe(
      "ConnectionPool",
    );
  });

  it("picks the class named after the Ruby entity when a file declares several", () => {
    const owners = new Set(["ConnectionPool", "NullPool"]);
    expect(resolveTsOwner(owners, "ActiveRecord::ConnectionAdapters::NullPool")).toBe("NullPool");
  });

  it("resolves nothing when no declaring class carries the Ruby name", () => {
    const owners = new Set(["ConnectionPool", "NullPool"]);
    expect(resolveTsOwner(owners, "ActiveRecord::ConnectionAdapters::PoolConfig")).toBeUndefined();
  });
});

describe("ambiguousTsOwner", () => {
  it("records nothing when a nested class shares the outer class's method name", () => {
    // relation.ts declares `first` on both `ExplainProxy` (relation.rb:24-26)
    // and `Relation`; `FinderMethods#first` resolves to neither by name.
    const owners = new Set(["Relation", "ExplainProxy"]);
    expect(ambiguousTsOwner(owners, resolveTsOwner(owners, "ActiveRecord::FinderMethods"))).toBe(
      true,
    );
  });

  it("compares as before once the Ruby entity names one of them", () => {
    const owners = new Set(["Relation", "ExplainProxy"]);
    expect(
      ambiguousTsOwner(owners, resolveTsOwner(owners, "ActiveRecord::Relation::ExplainProxy")),
    ).toBe(false);
  });

  it("compares as before when the file declares the name once", () => {
    const owners = new Set(["Relation"]);
    expect(ambiguousTsOwner(owners, resolveTsOwner(owners, "ActiveRecord::FinderMethods"))).toBe(
      false,
    );
  });
});

describe("ownerCallArgSites", () => {
  // The trails mixin convention (CLAUDE.md "Module mixins"): ONE body exported
  // free and re-exported through a grouping object, so the file records the
  // same sites twice — under `""` and under `TimeExt`.
  const sites = [{ name: "toTime", args: [] }];
  const twiceDeclared = new Map([
    [
      "time-ext.ts",
      new Map([
        [
          "toTime",
          new Map([
            ["", [sites]],
            ["TimeExt", [sites]],
          ]),
        ],
      ]),
    ],
  ]);
  const twiceDeclaredByFile = new Map([["time-ext.ts", new Map([["toTime", [sites, sites]]])]]);

  it("pairs a Ruby reader with the TS member, not the same-named set accessor", () => {
    // mime-negotiation.ts declares `formats` twice: the reader as a top-level
    // function (`""`) and `formats=` as `set formats` on `MimeNegotiation`
    // (mime_negotiation.rb:84-86 vs :136-141). The Ruby class's short name is
    // `MimeNegotiation` either way, so name-only resolution handed the reader
    // the writer's body.
    const owners = new Set(["", "MimeNegotiation"]);
    const writerOf = (o: string) => o === "MimeNegotiation";
    expect(
      resolveTsOwner(owners, "ActionDispatch::Http::MimeNegotiation", {
        writerOf,
        rubyIsWriter: false,
      }),
    ).toBe("");
    expect(
      resolveTsOwner(owners, "ActionDispatch::Http::MimeNegotiation", {
        writerOf,
        rubyIsWriter: true,
      }),
    ).toBe("MimeNegotiation");
  });

  it("leaves resolution to the later steps when no owner is a set accessor", () => {
    const owners = new Set(["", "MimeNegotiation"]);
    expect(
      resolveTsOwner(owners, "ActionDispatch::Http::MimeNegotiation", {
        writerOf: () => false,
        rubyIsWriter: false,
      }),
    ).toBe("MimeNegotiation");
  });

  it("compares a twice-declared single body under its resolved owner", () => {
    const owners = new Set(["", "TimeExt"]);
    const tsClass = resolveTsOwner(owners, "Time", {
      callSetOf: (o) => (o === "" || o === "TimeExt" ? [["toTime"]] : undefined),
    });
    expect(tsClass).toBe("");
    expect(
      ownerCallArgSites(twiceDeclared, twiceDeclaredByFile, "time-ext.ts", "toTime", tsClass),
    ).toBe(sites);
  });

  it("still bails when the owner is ambiguous and the file declares the name twice", () => {
    // relation.ts's `Relation#first` beside `ExplainProxy#first`: two genuinely
    // different bodies, so `resolveTsOwner` returns undefined and there is no
    // ground for pairing the Ruby sites against either.
    const first = [{ name: "findNth", args: [] }];
    const second = [{ name: "execExplain", args: [] }];
    const byOwner = new Map([
      [
        "relation.ts",
        new Map([
          [
            "first",
            new Map([
              ["Relation", [first]],
              ["ExplainProxy", [second]],
            ]),
          ],
        ]),
      ],
    ]);
    const byFile = new Map([["relation.ts", new Map([["first", [first, second]]])]]);
    expect(ownerCallArgSites(byOwner, byFile, "relation.ts", "first", undefined)).toBeUndefined();
  });

  it("compares the single whole-file entry when the file declares the name once", () => {
    const byFile = new Map([["relation.ts", new Map([["first", [sites]]])]]);
    expect(ownerCallArgSites(new Map(), byFile, "relation.ts", "first", "Relation")).toBe(sites);
  });
});

describe("resolveTsOwner — include graph and seats", () => {
  // relation.ts declares `first` on `Relation` and on the nested `ExplainProxy`
  // (relation.rb:24-26); `FinderMethods` names neither, but `Relation` is the
  // class the module is mixed onto (relation.rb's include chain).
  it("resolves a Ruby module flattened onto a TS host through the include graph", () => {
    const owners = new Set(["Relation", "ExplainProxy"]);
    expect(
      resolveTsOwner(owners, "ActiveRecord::FinderMethods", { hosts: new Set(["Relation"]) }),
    ).toBe("Relation");
  });

  it("stays ambiguous when several owners mix the module in", () => {
    const owners = new Set(["Relation", "ExplainProxy"]);
    expect(
      resolveTsOwner(owners, "ActiveRecord::FinderMethods", {
        hosts: new Set(["Relation", "ExplainProxy"]),
      }),
    ).toBeUndefined();
  });

  // persistence.rb declares `_update_record` on `ClassMethods` (:687-692) and on
  // the instance (:900-916); persistence.ts spells the class half as the free
  // export and the instance half as the `InstanceMethods` grouping.
  const persistence = {
    owners: new Set(["", "InstanceMethods"]),
    seatOf: (o: string) => (o === "InstanceMethods" ? ("instance" as const) : undefined),
    rubySeats: new Set(["class", "instance"] as const),
  };

  it("pairs a Ruby ClassMethods owner with the seatless top-level export", () => {
    expect(
      resolveTsOwner(persistence.owners, "ActiveRecord::Persistence::ClassMethods", {
        seatOf: persistence.seatOf,
        rubySeat: "class",
        rubySeats: persistence.rubySeats,
      }),
    ).toBe("");
  });

  it("pairs the bare Ruby owner with the prototype member", () => {
    expect(
      resolveTsOwner(persistence.owners, "ActiveRecord::Persistence", {
        seatOf: persistence.seatOf,
        rubySeat: "instance",
        rubySeats: persistence.rubySeats,
      }),
    ).toBe("InstanceMethods");
  });

  it("leaves the seats alone when the Ruby file poses no seat question", () => {
    // time-ext.ts declares `toTime` as a free export AND on the `TimeExt`
    // grouping, but `Date#to_time` is the only Ruby owner: the seat cannot say
    // which class the module ported to, so picking one would be a mispairing.
    expect(
      resolveTsOwner(new Set(["", "TimeExt"]), "Date", {
        seatOf: (o: string) => (o === "TimeExt" ? ("instance" as const) : undefined),
        rubySeat: "instance",
        rubySeats: new Set(["instance"] as const),
      }),
    ).toBeUndefined();
  });

  it("resolves one body declared twice — the free export and the grouping", () => {
    // The trails mixin convention: `export function toTime()` beside
    // `export const TimeExt = { toTime }`, so both owners record the SAME
    // call-set and the comparison is identical whichever is picked.
    const calls = { "": [["getlocal"]], TimeExt: [["getlocal"]] };
    expect(
      resolveTsOwner(new Set(["", "TimeExt"]), "Date", {
        callSetOf: (o: string) => calls[o as keyof typeof calls],
      }),
    ).toBe("");
  });

  it("refuses two owners whose call-sets differ", () => {
    // relation.ts's `ExplainProxy#first` next to the `Relation` overload: two
    // bodies, so picking one is the mispairing the resolution exists to avoid.
    const calls = { Relation: [["findNth"]], ExplainProxy: [["execExplain"]] };
    expect(
      resolveTsOwner(new Set(["Relation", "ExplainProxy"]), "ActiveRecord::FinderMethods", {
        callSetOf: (o: string) => calls[o as keyof typeof calls],
      }),
    ).toBeUndefined();
  });

  it("refuses when an owner records no call-set at all", () => {
    const calls: Record<string, string[][]> = { TimeExt: [["getlocal"]] };
    expect(
      resolveTsOwner(new Set(["", "TimeExt"]), "Date", { callSetOf: (o: string) => calls[o] }),
    ).toBeUndefined();
  });
});

describe("tsOwnerSeat", () => {
  it("reads the trails grouping names before staticness", () => {
    // An object literal's members are prototype members of the grouping, so
    // `isStatic` would call `ClassMethods` the instance seat.
    expect(tsOwnerSeat("ClassMethods", undefined, new Set(["ClassMethods"]))).toBe("class");
    expect(tsOwnerSeat("InstanceMethods", undefined, new Set(["InstanceMethods"]))).toBe(
      "instance",
    );
  });

  it("reads a class declaration's staticness", () => {
    expect(tsOwnerSeat("Base", new Set(["Base"]), undefined)).toBe("class");
    expect(tsOwnerSeat("Base", undefined, new Set(["Base"]))).toBe("instance");
  });

  it("states no seat for a declaration that is both, or for neither", () => {
    expect(tsOwnerSeat("Base", new Set(["Base"]), new Set(["Base"]))).toBeUndefined();
    expect(tsOwnerSeat("", undefined, undefined)).toBeUndefined();
  });
});

describe("rubyOwnerSeat", () => {
  it("reads the ClassMethods suffix as the singleton seat", () => {
    expect(rubyOwnerSeat("ActiveRecord::Persistence::ClassMethods", false)).toBe("class");
    expect(rubyOwnerSeat("ActiveRecord::Persistence", false)).toBe("instance");
  });

  it("reads a `def self.` method as the singleton seat wherever it lives", () => {
    expect(rubyOwnerSeat("ActiveRecord::Base", true)).toBe("class");
  });
});

describe("ambiguousRubyOwner", () => {
  it("records nothing when two Ruby owners share one TS member", () => {
    // persistence.rb defines `_update_record` on both `Persistence` (:900) and
    // `Persistence::ClassMethods` (:687); persistence.ts exports one
    // `_updateRecord`.
    const rubyOwners = new Set([
      "ActiveRecord::Persistence",
      "ActiveRecord::Persistence::ClassMethods",
    ]);
    expect(ambiguousRubyOwner(rubyOwners, new Set([""]))).toBe(true);
  });

  it("compares when the TS side declares the name on several owners too", () => {
    const rubyOwners = new Set([
      "ActiveRecord::Persistence",
      "ActiveRecord::Persistence::ClassMethods",
    ]);
    expect(ambiguousRubyOwner(rubyOwners, new Set(["Base", "ClassMethods"]))).toBe(false);
  });

  it("compares when only one Ruby owner declares the name", () => {
    expect(ambiguousRubyOwner(new Set(["ActiveRecord::Persistence"]), new Set([""]))).toBe(false);
  });

  it("compares the arm whose seat the single TS member is declared on", () => {
    const rubyOwners = new Set([
      "ActiveRecord::Persistence",
      "ActiveRecord::Persistence::ClassMethods",
    ]);
    const resolution = { tsSeat: "class" as const, rubyOwnersOnTsSeat: 1 };
    expect(
      ambiguousRubyOwner(rubyOwners, new Set(["Base"]), { ...resolution, rubySeat: "class" }),
    ).toBe(false);
    expect(
      ambiguousRubyOwner(rubyOwners, new Set(["Base"]), { ...resolution, rubySeat: "instance" }),
    ).toBe(true);
  });

  it("still records nothing when several Ruby owners share the TS member's seat", () => {
    // routing/mapper.rb declares `add_route` on `Base`, `Resources` and
    // `Scoping`, all instance: the seat answers nothing the count did not.
    const rubyOwners = new Set([
      "ActionDispatch::Routing::Mapper::Base",
      "ActionDispatch::Routing::Mapper::Resources",
    ]);
    expect(
      ambiguousRubyOwner(rubyOwners, new Set(["Mapper"]), {
        rubySeat: "instance",
        tsSeat: "instance",
        rubyOwnersOnTsSeat: 2,
      }),
    ).toBe(true);
  });
});

describe("writerPairedWithReader", () => {
  const siblings = new Set(["current_scope", "current_scope="]);

  it("records nothing when a Ruby writer lands on the reader's TS body", () => {
    expect(writerPairedWithReader("current_scope=", "currentScope", siblings)).toBe(true);
  });

  it("compares a writer ported as the awaitable setX", () => {
    expect(writerPairedWithReader("current_scope=", "setCurrentScope", siblings)).toBe(false);
  });

  it("compares a writer whose Ruby surface has no reader to collide with", () => {
    expect(writerPairedWithReader("flash=", "flash", new Set(["flash="]))).toBe(false);
  });

  it("leaves non-writers alone", () => {
    expect(writerPairedWithReader("current_scope", "currentScope", siblings)).toBe(false);
  });
});

describe("tagsForOwner", () => {
  const byClass = new Map([
    ["ConnectionPool", new Set(["synchronize"])],
    ["NullPool", new Set(["reload"])],
  ]);

  it("reads only the resolved owner's tags", () => {
    expect([...tagsForOwner(byClass, "ConnectionPool")!]).toEqual(["synchronize"]);
  });

  it("gives an owner with no tags of its own nothing from its siblings", () => {
    expect(tagsForOwner(new Map([["NullPool", new Set(["synchronize"])]]), "ConnectionPool")).toBe(
      undefined,
    );
  });

  it("falls back to the union when the owner is unresolved", () => {
    expect([...tagsForOwner(byClass, undefined)!].sort()).toEqual(["reload", "synchronize"]);
  });
});

describe("splitOverriddenFileBuckets", () => {
  function m(name: string, file: string): MethodInfo {
    return { name, visibility: "public", params: [], file };
  }
  const inflector: ClassInfo = {
    name: "Inflector",
    file: "inflector/inflections.rb",
    includes: ["Comparable"],
    extends: [],
    instanceMethods: [
      m("inflections", "inflector/inflections.rb"),
      m("deconstantize", "inflector/methods.rb"),
      m("constantize", "inflector/methods.rb"),
      m("transliterate", "inflector/transliterate.rb"),
    ],
    classMethods: [],
  };

  it("moves a mapped reopening file's methods into a bucket of their own", () => {
    const out = splitOverriddenFileBuckets(
      { fqn: "ActiveSupport::Inflector", info: inflector },
      "activesupport",
    );
    expect(out.map((e) => e.info.file)).toEqual([
      "inflector/inflections.rb",
      "inflector/methods.rb",
      "inflector/transliterate.rb",
    ]);
    expect(out[0].info.instanceMethods.map((im) => im.name)).toEqual(["inflections"]);
    expect(out[1].info.instanceMethods.map((im) => im.name)).toEqual([
      "deconstantize",
      "constantize",
    ]);
  });

  it("keeps the fqn but drops includes/extends on the split bucket", () => {
    const out = splitOverriddenFileBuckets(
      { fqn: "ActiveSupport::Inflector", info: inflector },
      "activesupport",
    );
    expect(out[1].fqn).toBe("ActiveSupport::Inflector");
    expect(out[1].info.includes).toEqual([]);
    expect(out[0].info.includes).toEqual(["Comparable"]);
  });

  it("returns the entity untouched when no reopening file is mapped in this package", () => {
    const entity = { fqn: "ActiveSupport::Inflector", info: inflector };
    expect(splitOverriddenFileBuckets(entity, "activerecord")).toEqual([entity]);
  });

  it("does not split the entity's own home file", () => {
    const entity = {
      fqn: "ActiveSupport::Inflector",
      info: { ...inflector, file: "inflector/methods.rb" },
    };
    const out = splitOverriddenFileBuckets(entity, "activesupport");
    expect(out[0].info.file).toBe("inflector/methods.rb");
    expect(out[0].info.instanceMethods).toHaveLength(3);
  });
});

describe("mixinMethodCreditedToOwnFile", () => {
  const encryptableTs = new Set(["encryptedAttributes", "encrypts", "schemeFor"]);
  const tsMethodsByFile = new Map([["encryption/encryptable-record.ts", encryptableTs]]);
  const hasBucket = (f: string) => f === "encryption/encryptable_record.rb";

  it("credits a flattened mixin method to the file mirroring the mixin's own", () => {
    expect(
      mixinMethodCreditedToOwnFile(
        { rubyName: "scheme_for", mixinFile: "encryption/encryptable_record.rb" },
        "base.rb",
        "activerecord",
        hasBucket,
        tsMethodsByFile,
      ),
    ).toEqual({ tsName: "schemeFor", tsFile: "encryption/encryptable-record.ts" });
  });

  it("recognizes the include seam a host keeps beside the mixin's own port", () => {
    // postgresql_adapter.rb flattens `PostgreSQL::Quoting#quoted_date`
    // (postgresql/quoting.rb:143) onto the adapter; trails ports the body into
    // postgresql/quoting.ts and leaves postgresql-adapter.ts a one-line
    // forwarder. Non-null here is what tells checkCalls to hold the mixin's
    // own bucket to the call set, not the seam.
    expect(
      mixinMethodCreditedToOwnFile(
        { rubyName: "quoted_date", mixinFile: "connection_adapters/postgresql/quoting.rb" },
        "connection_adapters/postgresql_adapter.rb",
        "activerecord",
        (f) => f === "connection_adapters/postgresql/quoting.rb",
        new Map([["connection-adapters/postgresql/quoting.ts", new Set(["quotedDate"])]]),
      ),
    ).toEqual({
      tsName: "quotedDate",
      tsFile: "connection-adapters/postgresql/quoting.ts",
    });
  });

  it("does not credit a method the host declares itself", () => {
    expect(
      mixinMethodCreditedToOwnFile(
        { rubyName: "scheme_for" },
        "base.rb",
        "activerecord",
        hasBucket,
        tsMethodsByFile,
      ),
    ).toBeNull();
  });

  it("does not credit a mixin method that is unported in the mixin's own file", () => {
    expect(
      mixinMethodCreditedToOwnFile(
        { rubyName: "encrypt_attribute", mixinFile: "encryption/encryptable_record.rb" },
        "base.rb",
        "activerecord",
        hasBucket,
        tsMethodsByFile,
      ),
    ).toBeNull();
  });

  it("does not credit when the mixin's own Ruby file has no bucket of its own", () => {
    // Nothing measures the mixin's file, so crediting there would drop the
    // expectation entirely instead of moving it.
    expect(
      mixinMethodCreditedToOwnFile(
        { rubyName: "scheme_for", mixinFile: "encryption/encryptable_record.rb" },
        "base.rb",
        "activerecord",
        () => false,
        tsMethodsByFile,
      ),
    ).toBeNull();
  });
});

describe("reopeningMethodCreditedToOwnFile", () => {
  // `core_ext/object/acts_like.rb` is the first core_ext file to reopen Object,
  // so `blank?`, `duplicable?` and `instance_values` all bucket under it while
  // trails ports each to the file mirroring its own reopening.
  const tsMethodsByFile = new Map([
    ["core-ext/object/blank.ts", new Set(["isBlank", "isPresent"])],
    ["core-ext/object/duplicable.ts", new Set(["isDuplicable"])],
    ["core-ext/object/instance-variables.ts", new Set(["instanceValues"])],
  ]);

  it("credits each reopening's arm to the TS file mirroring that reopening", () => {
    expect(
      reopeningMethodCreditedToOwnFile(
        { rubyName: "duplicable?", definedInFile: "core_ext/object/duplicable.rb" },
        "core_ext/object/acts_like.rb",
        "activesupport",
        tsMethodsByFile,
      ),
    ).toEqual({ tsName: "isDuplicable", tsFile: "core-ext/object/duplicable.ts" });

    expect(
      reopeningMethodCreditedToOwnFile(
        { rubyName: "instance_values", definedInFile: "core_ext/object/instance_variables.rb" },
        "core_ext/object/acts_like.rb",
        "activesupport",
        tsMethodsByFile,
      ),
    ).toEqual({ tsName: "instanceValues", tsFile: "core-ext/object/instance-variables.ts" });
  });

  it("does not credit a method the home file defines itself", () => {
    expect(
      reopeningMethodCreditedToOwnFile(
        { rubyName: "acts_like?", definedInFile: "core_ext/object/acts_like.rb" },
        "core_ext/object/acts_like.rb",
        "activesupport",
        tsMethodsByFile,
      ),
    ).toBeNull();
  });

  it("does not credit a reopening arm that is unported in its own file", () => {
    expect(
      reopeningMethodCreditedToOwnFile(
        { rubyName: "deep_dup", definedInFile: "core_ext/object/duplicable.rb" },
        "core_ext/object/acts_like.rb",
        "activesupport",
        tsMethodsByFile,
      ),
    ).toBeNull();
  });

  it("does not credit when the reopening's TS file is absent from the run", () => {
    expect(
      reopeningMethodCreditedToOwnFile(
        { rubyName: "to_query", definedInFile: "core_ext/object/to_query.rb" },
        "core_ext/object/acts_like.rb",
        "activesupport",
        tsMethodsByFile,
      ),
    ).toBeNull();
  });
});

describe("narrowPredicateCandidates", () => {
  const map = (c: string) => rubyMethodToTs(c);

  it("drops the bare spelling when the body also makes the plain call", () => {
    expect(
      narrowPredicateCandidates(
        "find_target?",
        ["isFindTarget", "findTarget"],
        ["find_target?", "find_target"],
        map,
      ),
    ).toEqual(["isFindTarget"]);
  });

  it("keeps both spellings when the plain call is absent", () => {
    expect(
      narrowPredicateCandidates(
        "find_target?",
        ["isFindTarget", "findTarget"],
        ["find_target?"],
        map,
      ),
    ).toEqual(["isFindTarget", "findTarget"]);
  });

  it("leaves a non-predicate call alone", () => {
    expect(narrowPredicateCandidates("find_target", ["findTarget"], ["find_target"], map)).toEqual([
      "findTarget",
    ]);
  });

  it("keeps the whole list rather than narrowing to nothing", () => {
    expect(narrowPredicateCandidates("save?", ["save"], ["save?", "save"], () => ["save"])).toEqual(
      ["save"],
    );
  });
});

describe("ambiguousTsNames", () => {
  const map = (c: string) => rubyMethodToTs(c);

  it("names the TS spelling a predicate and its plain sibling share", () => {
    expect([...ambiguousTsNames(["validate?", "validate", "name"], map)]).toEqual(["validate"]);
  });

  it("is empty when every Ruby call maps to its own TS names", () => {
    expect([...ambiguousTsNames(["build_record", "add_to_target"], map)]).toEqual([]);
  });
});

describe("reorderedCalls (RFC 0084 order-only call parity)", () => {
  const map = (c: string) => rubyMethodToTs(c);
  const wide = { has: (k: string) => k !== "super" };
  const ported = () => true;

  it("flags a body that makes Rails' calls in a different order", () => {
    expect(
      reorderedCalls("create", ["build", "save"], ["save", "build"], ported, map, wide),
    ).toEqual([`${ORDER_PREFIX}save,build → build,save`]);
  });

  it("stays silent when the sequences agree", () => {
    expect(
      reorderedCalls("create", ["build", "save"], ["build", "save"], ported, map, wide),
    ).toEqual([]);
  });

  it("ignores intervening TS calls Rails does not make", () => {
    expect(
      reorderedCalls("create", ["build", "save"], ["build", "dup", "save"], ported, map, wide),
    ).toEqual([]);
  });

  it("leaves a dropped call to the missing-call check rather than reporting order", () => {
    // `save` is absent from TS, so this is a divergence, not a reordering: the
    // two checks must not double-report the same body.
    expect(reorderedCalls("create", ["build", "save"], ["build"], ported, map, wide)).toEqual([]);
    expect(
      significantMissingCalls("create", ["build", "save"], new Set(["build"]), ported, map, wide),
    ).toEqual(["save → save"]);
  });

  it("reports one flag per body, naming the first inversion", () => {
    expect(
      reorderedCalls(
        "create",
        ["build", "save", "touch"],
        ["touch", "save", "build"],
        ported,
        map,
        wide,
      ),
    ).toEqual([`${ORDER_PREFIX}save,build → build,save`]);
  });

  it("never flags a single matched call, nor the self call, nor super", () => {
    expect(reorderedCalls("create", ["build"], ["build"], ported, map, wide)).toEqual([]);
    expect(reorderedCalls("save", ["save", "touch"], ["touch", "save"], ported, map, wide)).toEqual(
      [],
    );
    expect(
      reorderedCalls("save", ["super", "touch", "build"], ["touch", "build"], ported, map, wide),
    ).toEqual([]);
  });

  it("does not credit a predicate with the plain call's TS position", () => {
    expect(
      reorderedCalls(
        "load_target",
        ["find_target?", "merge_target_lists", "find_target"],
        ["findTargetNeeded", "mergeTargetLists", "findTarget"],
        ported,
        map,
        wide,
      ),
    ).toEqual([]);
  });

  it("drops a TS name two of the body's Ruby calls could both be ported as", () => {
    expect(
      reorderedCalls(
        "define_autosave_validation_callbacks",
        ["define_non_cyclic_method", "validate"],
        ["validate", "defineNonCyclicMethod"],
        ported,
        map,
        wide,
        ["validate?", "define_non_cyclic_method", "validate"],
      ),
    ).toEqual([]);
    expect(
      reorderedCalls(
        "define_autosave_validation_callbacks",
        ["define_non_cyclic_method", "validate"],
        ["validate", "defineNonCyclicMethod"],
        ported,
        map,
        wide,
      ),
    ).toEqual([`${ORDER_PREFIX}validate,defineNonCyclicMethod → defineNonCyclicMethod,validate`]);
  });

  it("respects the ported-with-args gate the missing-call check uses", () => {
    // A zero-arg reader Ruby records as a call but TS reads as `this.x` must not
    // manufacture a position — same gate 2 as significantMissingCalls.
    expect(
      reorderedCalls("create", ["build", "save"], ["save", "build"], () => false, map, wide),
    ).toEqual([]);
  });
});

describe("suppressedCallClaims", () => {
  it("claims the TS spelling of a call the ported-with-args gate suppresses", () => {
    const claimed = suppressedCallClaims(
      ["method_defined?", "include?"],
      new Set(["has"]),
      (ts) => ts === "include",
      (rc) => (rc === "method_defined?" ? ["methodDefined"] : ["include"]),
      new Set(["method_defined?", "include?"]),
    );
    expect([...claimed]).toEqual(["has"]);
  });

  it("claims nothing for a NO_JS_CALL_FORM name, whose port emits no callee", () => {
    const claimed = suppressedCallClaims(
      ["key?"],
      new Set(["has"]),
      () => false,
      () => ["key"],
    );
    expect([...claimed]).toEqual([]);
  });

  it("claims nothing when the suppressed call's spelling is absent from the TS body", () => {
    const claimed = suppressedCallClaims(
      ["method_defined?"],
      new Set(["set"]),
      () => false,
      () => ["methodDefined"],
    );
    expect([...claimed]).toEqual([]);
  });
});
