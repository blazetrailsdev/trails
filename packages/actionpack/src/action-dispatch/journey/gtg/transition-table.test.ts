import { describe, it, expect } from "vitest";
import { getChildProcess } from "@blazetrails/ruby-compat";
import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { Parser } from "../parser.js";
import { Or } from "../nodes/node.js";
import type { Node } from "../nodes/node.js";
import { Builder } from "./builder.js";
import { Simulator } from "./simulator.js";

function asts(paths: string[]): Node[] {
  const parser = new Parser();
  return paths.map((x) => {
    const ast = parser.parse(x)!;
    for (const n of ast) n.memo = ast;
    return ast;
  });
}

function tt(paths: string[]) {
  const x = asts(paths);
  const builder = new Builder(new Or(x));
  return builder.transitionTable();
}

function simulatorFor(paths: string[]) {
  return new Simulator(tt(paths));
}

function assertMatchRoute(simulator: Simulator, path: string): void {
  expect(
    simulator.memos(path, () => []),
    `Simulator should match ${path}.`,
  ).not.toHaveLength(0);
}

function assertNoMatchRoute(simulator: Simulator, path: string): void {
  expect(
    simulator.memos(path, () => []),
    `Simulator should not match ${path}.`,
  ).toHaveLength(0);
}

function dotInstalled(): boolean {
  try {
    return getChildProcess().spawnSync("dot", ["-V"]).status === 0;
  } catch {
    return false;
  }
}

describe("ActionDispatch::Journey::GTG::TransitionTable", () => {
  it("to json", () => {
    const table = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);

    const json = ActiveSupportJSON.decode(table.toJSON()) as Record<string, unknown>;
    expect(json["regexp_states"]).toBeTruthy();
    expect(json["string_states"]).toBeTruthy();
    expect(json["accepting"]).toBeTruthy();
  });

  it.runIf(dotInstalled())("to svg", () => {
    const table = tt([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);
    const svg = table.toSvg();
    expect(svg).toBeTruthy();
    expect(svg).not.toMatch(/DOCTYPE/);
  });

  it("simulate gt", () => {
    const sim = simulatorFor(["/foo", "/bar"]);
    assertMatchRoute(sim, "/foo");
  });

  it("simulate gt regexp", () => {
    const sim = simulatorFor([":foo"]);
    assertMatchRoute(sim, "foo");
  });

  it("simulate gt regexp mix", () => {
    const sim = simulatorFor(["/get", "/:method/foo"]);
    assertMatchRoute(sim, "/get");
    assertMatchRoute(sim, "/get/foo");
  });

  it("simulate optional", () => {
    const sim = simulatorFor(["/foo(/bar)"]);
    assertMatchRoute(sim, "/foo");
    assertMatchRoute(sim, "/foo/bar");
    assertNoMatchRoute(sim, "/foo/");
  });

  it("match data", () => {
    const pathAsts = asts(["/get", "/:method/foo"]);
    const paths = [...pathAsts];

    const builder = new Builder(new Or(pathAsts));
    const table = builder.transitionTable();

    const sim = new Simulator(table);

    let memos = sim.memos("/get", () => []);
    expect(memos).toEqual([paths[0]]);

    memos = sim.memos("/get/foo", () => []);
    expect(memos).toEqual([paths[paths.length - 1]]);
  });

  it("match data ambiguous", () => {
    const pathAsts = asts([
      "/articles(.:format)",
      "/articles/new(.:format)",
      "/articles/:id/edit(.:format)",
      "/articles/:id(.:format)",
    ]);

    const paths = [...pathAsts];
    const ast = new Or(pathAsts);

    const builder = new Builder(ast);
    const sim = new Simulator(builder.transitionTable());

    const memos = sim.memos("/articles/new", () => []);
    expect(new Set(memos)).toEqual(new Set([paths[1], paths[3]]));
  });
});
