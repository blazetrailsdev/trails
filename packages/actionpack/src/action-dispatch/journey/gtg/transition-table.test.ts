import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Or } from "../nodes/node.js";
import { Builder } from "./builder.js";
import { Simulator } from "./simulator.js";
import { TransitionTable } from "./transition-table.js";

function asts(strings: string[]) {
  const parser = new Parser();
  return strings.map((s) => {
    const tree = parser.parse(s);
    for (const n of tree) n.memo = tree;
    return tree;
  });
}

function tt(strings: string[]) {
  return new Builder(new Or(asts(strings))).transitionTable();
}

function simulatorFor(strings: string[]) {
  return new Simulator(tt(strings));
}

describe("ActionDispatch::Journey::GTG::TransitionTable — set() regex anchoring", () => {
  it("wraps alternation so anchors bind around the whole regex, not branches", () => {
    const t = new TransitionTable();
    t.set(0, 1, /foo|bar/);
    // Token "xfooy" must NOT match — would have, with /^foo|bar$/ (parses as
    // (^foo)|(bar$)).
    const next = t.move([[0, null]], "xfooy", 0, 5);
    // Only the "carry forward" self-loop entry, no transition to 1.
    expect(next.some(([s]) => s === 1)).toBe(false);
    // Real "foo" still matches.
    expect(t.move([[0, null]], "foo", 0, 3).some(([s]) => s === 1)).toBe(true);
  });

  it("preserves /i flag on the stored regex", () => {
    const t = new TransitionTable();
    t.set(0, 1, /foo/i);
    expect(t.move([[0, null]], "FOO", 0, 3).some(([s]) => s === 1)).toBe(true);
  });

  it("filters /m to keep ^/$ strict — newline tokens must not slip in", () => {
    const t = new TransitionTable();
    t.set(0, 1, /foo/m);
    // /m would have made ^foo$ line-anchored; "foo\nbar" would have matched
    // the first line. After filtering, only "foo" exactly matches.
    expect(t.move([[0, null]], "foo\nbar", 0, 7).some(([s]) => s === 1)).toBe(false);
    expect(t.move([[0, null]], "foo", 0, 3).some(([s]) => s === 1)).toBe(true);
  });
});

describe("ActionDispatch::Journey::GTG::TransitionTable", () => {
  it("test_to_json", () => {
    const t = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const json = t.toJSON() as {
      regexp_states: Record<string, Record<string, number>>;
      string_states: Record<string, Record<string, number>>;
      stdparam_states: Record<string, Record<string, number>>;
      accepting: Record<string, true>;
    };

    // Shape: every accepting key is an integer state id, mapped to `true`.
    expect(Object.values(json.accepting).every((v) => v === true)).toBe(true);
    expect(Object.keys(json.accepting).every((k) => /^\d+$/.test(k))).toBe(true);
    expect(Object.keys(json.accepting).length).toBeGreaterThan(0);

    // A `/articles` route must produce a `/` and `articles` string-state transition.
    const allStringEdges = new Set<string>();
    for (const inner of Object.values(json.string_states)) {
      for (const edge of Object.keys(inner)) allStringEdges.add(edge);
    }
    expect(allStringEdges.has("/")).toBe(true);
    expect(allStringEdges.has("articles")).toBe(true);

    // Standard-param routes (e.g. `:format`, `:id`) should produce a
    // stdparam transition whose key is the DEFAULT_EXP source.
    const allStdparamEdges = new Set<string>();
    for (const inner of Object.values(json.stdparam_states)) {
      for (const edge of Object.keys(inner)) allStdparamEdges.add(edge);
    }
    expect([...allStdparamEdges].some((s) => s.includes("[^./?]+"))).toBe(true);

    // Every transition target must point at a known state id (integer key).
    const allStateIds = new Set<string>([
      ...Object.keys(json.string_states),
      ...Object.keys(json.stdparam_states),
      ...Object.keys(json.regexp_states),
      ...Object.keys(json.accepting),
    ]);
    for (const inner of [
      ...Object.values(json.string_states),
      ...Object.values(json.stdparam_states),
      ...Object.values(json.regexp_states),
    ]) {
      for (const target of Object.values(inner)) {
        expect(allStateIds.has(String(target))).toBe(true);
      }
    }
  });

  it("test_simulate_gt", () => {
    const sim = simulatorFor(["/foo", "/bar"]);
    expect(sim.memos("/foo", () => []).length).toBeGreaterThan(0);
  });

  it("test_simulate_gt_regexp", () => {
    const sim = simulatorFor([":foo"]);
    expect(sim.memos("foo", () => []).length).toBeGreaterThan(0);
  });

  it("test_simulate_gt_regexp_mix", () => {
    const sim = simulatorFor(["/get", "/:method/foo"]);
    expect(sim.memos("/get", () => []).length).toBeGreaterThan(0);
    expect(sim.memos("/get/foo", () => []).length).toBeGreaterThan(0);
  });

  it("test_simulate_optional", () => {
    const sim = simulatorFor(["/foo(/bar)"]);
    expect(sim.memos("/foo", () => []).length).toBeGreaterThan(0);
    expect(sim.memos("/foo/bar", () => []).length).toBeGreaterThan(0);
    expect(sim.memos("/foo/", () => []).length).toBe(0);
  });

  it("root-level optional group matches paths starting with the optional segment", () => {
    // `(/:foo)` is fully-optional at the root; the parser produces a Group
    // wrapping Cat(Slash, Symbol). Match must succeed for a real path.
    const sim = simulatorFor(["(/:foo)"]);
    expect(sim.memos("/bar", () => []).length).toBeGreaterThan(0);
  });

  it("test_match_data", () => {
    const pathAsts = asts(["/get", "/:method/foo"]);
    const builder = new Builder(new Or(pathAsts));
    const sim = new Simulator(builder.transitionTable());

    expect(sim.memos("/get", () => [])).toEqual([pathAsts[0]]);
    expect(sim.memos("/get/foo", () => [])).toEqual([pathAsts[1]]);
  });

  it("test_match_data_ambiguous", () => {
    const pathAsts = asts([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const sim = new Simulator(new Builder(new Or(pathAsts)).transitionTable());
    const memos = new Set(sim.memos("/articles/new", () => []));
    expect(memos).toEqual(new Set([pathAsts[1], pathAsts[3]]));
  });
});
