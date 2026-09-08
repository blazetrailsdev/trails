import { describe, it, expect } from "vitest";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { Parser } from "../parser.js";
import { Or } from "../nodes/node.js";
import { Builder } from "./builder.js";
import { Simulator } from "./simulator.js";
import { TransitionTable } from "./transition-table.js";

function asts(paths: string[]) {
  const parser = new Parser();
  return paths.map((x) => {
    const ast = parser.parse(x);
    for (const n of ast) n.memo = ast;
    return ast;
  });
}

function tt(paths: string[]) {
  return new Builder(new Or(asts(paths))).transitionTable();
}

describe("ActionDispatch::Journey::GTG::TransitionTable — set() regex anchoring", () => {
  it("wraps alternation so anchors bind around the whole regex, not branches", () => {
    const t = new TransitionTable();
    t.set(0, 1, /foo|bar/);
    const next = t.move([[0, null]], "xfooy", 0, 5);
    expect(next.some(([s]) => s === 1)).toBe(false);
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
    expect(t.move([[0, null]], "foo\nbar", 0, 7).some(([s]) => s === 1)).toBe(false);
    expect(t.move([[0, null]], "foo", 0, 3).some(([s]) => s === 1)).toBe(true);
  });
});

describe("ActionDispatch::Journey::GTG::TransitionTable — toJSON structure", () => {
  it("names every edge target as a known state and keys accepting states by id", () => {
    const t = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const json = ActiveSupportJSON.decode(t.toJSON()) as {
      regexp_states: Record<string, Record<string, number>>;
      string_states: Record<string, Record<string, number>>;
      stdparam_states: Record<string, Record<string, number>>;
      accepting: Record<string, true>;
    };

    expect(Object.values(json.accepting).every((v) => v === true)).toBe(true);
    expect(Object.keys(json.accepting).every((k) => /^\d+$/.test(k))).toBe(true);
    expect(Object.keys(json.accepting).length).toBeGreaterThan(0);

    const allStringEdges = new Set<string>();
    for (const inner of Object.values(json.string_states)) {
      for (const edge of Object.keys(inner)) allStringEdges.add(edge);
    }
    expect(allStringEdges.has("/")).toBe(true);
    expect(allStringEdges.has("articles")).toBe(true);

    const allStdparamEdges = new Set<string>();
    for (const inner of Object.values(json.stdparam_states)) {
      for (const edge of Object.keys(inner)) allStdparamEdges.add(edge);
    }
    expect([...allStdparamEdges].some((s) => s.includes("[^./?]+"))).toBe(true);

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

  it("root-level optional group matches paths starting with the optional segment", () => {
    const sim = new Simulator(tt(["(/:foo)"]));
    expect(sim.memos("/bar", () => []).length).toBeGreaterThan(0);
  });
});
