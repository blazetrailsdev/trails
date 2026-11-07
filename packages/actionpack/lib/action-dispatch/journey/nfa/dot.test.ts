import { describe, it, expect } from "vitest";
import { toDot, type DotHost } from "./dot.js";

function makeHost(
  transitions: ReadonlyArray<readonly [number, string | null, number]>,
  acceptingStates: readonly number[],
): DotHost & { toDot: () => string } {
  const host = {
    transitions: () => transitions,
    acceptingStates: () => acceptingStates,
  } as DotHost;
  return Object.assign(host, { toDot: toDot.bind(host) });
}

describe("ActionDispatch::Journey::NFA::Dot", () => {
  it("renders edge labels and accepting states", () => {
    const out = makeHost(
      [
        [0, "a", 1],
        [1, "b", 2],
      ],
      [2],
    ).toDot();
    expect(out).toContain("rankdir=LR;");
    expect(out).toContain('0 -> 1 [label="a"];');
    expect(out).toContain('1 -> 2 [label="b"];');
    expect(out).toContain("doublecircle");
    expect(out).toContain("2;");
  });

  it("labels null symbols as ε (epsilon)", () => {
    const out = makeHost([[0, null, 1]], [1]).toDot();
    expect(out).toContain('0 -> 1 [label="ε"];');
  });

  it("joins multiple accepting states with spaces", () => {
    const out = makeHost([], [1, 2, 3]).toDot();
    expect(out).toContain("1 2 3;");
  });
});
