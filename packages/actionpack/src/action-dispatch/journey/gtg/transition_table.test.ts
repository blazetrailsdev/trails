import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Or } from "../nodes/node.js";
import { Builder } from "./builder.js";
import { Simulator } from "./simulator.js";

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

import { TransitionTable } from "./transition_table.js";

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
});

describe("ActionDispatch::Journey::GTG::TransitionTable", () => {
  it("test_to_json", () => {
    const t = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const json = t.toJSON() as Record<string, unknown>;
    expect(json["regexp_states"]).toBeDefined();
    expect(json["string_states"]).toBeDefined();
    expect(json["accepting"]).toBeDefined();
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
