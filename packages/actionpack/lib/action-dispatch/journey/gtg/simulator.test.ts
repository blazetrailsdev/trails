import { describe, it, expect } from "vitest";
import { MatchData, Simulator, type GtgState, type TransitionTableLike } from "./simulator.js";

class FakeTable implements TransitionTableLike {
  constructor(
    private readonly accept: ReadonlySet<number>,
    private readonly memos: Record<number, readonly unknown[]>,
    private readonly nextState: (
      state: GtgState,
      str: string,
      from: number,
      to: number,
    ) => GtgState,
  ) {}

  move(state: GtgState, str: string, from: number, to: number): GtgState {
    return this.nextState(state, str, from, to);
  }

  memo(state: number): readonly unknown[] {
    return this.memos[state] ?? [];
  }

  isAccepting(state: number): boolean {
    return this.accept.has(state);
  }
}

describe("ActionDispatch::Journey::GTG::MatchData", () => {
  it("exposes memos", () => {
    const md = new MatchData(["a", "b"]);
    expect(md.memos).toEqual(["a", "b"]);
  });
});

describe("ActionDispatch::Journey::GTG::Simulator", () => {
  it("yields fallback when no accepting state is reached", () => {
    const tt = new FakeTable(new Set(), {}, () => []);
    const result = new Simulator(tt).memos("/foo", () => ["fallback"]);
    expect(result).toEqual(["fallback"]);
  });

  it("returns concatenated memos for accepting states", () => {
    const tt = new FakeTable(new Set([1]), { 1: ["matched"] }, () => [[1, null]]);
    const result = new Simulator(tt).memos("/foo", () => ["fallback"]);
    expect(result).toEqual(["matched"]);
  });

  it("ignores accepting states whose dataIndex is non-null", () => {
    const tt = new FakeTable(new Set([1]), { 1: ["matched"] }, () => [[1, 0]]);
    const result = new Simulator(tt).memos("/foo", () => ["fallback"]);
    expect(result).toEqual(["fallback"]);
  });

  it("scans path delimiters and runs", () => {
    const calls: Array<[number, number, string]> = [];
    const tt = new FakeTable(new Set(), {}, (state, str, from, to) => {
      calls.push([from, to, str.slice(from, to)]);
      return state;
    });
    new Simulator(tt).memos("/foo.bar", () => []);
    expect(calls).toEqual([
      [0, 1, "/"],
      [1, 4, "foo"],
      [4, 5, "."],
      [5, 8, "bar"],
    ]);
  });

  it("scans `?` as its own token", () => {
    const calls: string[] = [];
    const tt = new FakeTable(new Set(), {}, (state, str, from, to) => {
      calls.push(str.slice(from, to));
      return state;
    });
    new Simulator(tt).memos("/a?b", () => []);
    expect(calls).toEqual(["/", "a", "?", "b"]);
  });
});
