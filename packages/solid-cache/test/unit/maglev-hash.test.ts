import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { MaglevHash } from "../../lib/maglev-hash.js";

function nodesFor1To30(maglevHash: MaglevHash) {
  const results: { [node: string]: number[] } = {};
  for (let key = 1; key <= 30; key++) (results[maglevHash.node(key)] ??= []).push(key);
  return results;
}

describe("SolidCache::MaglevHashTest", () => {
  it("two nodes", () => {
    const maglevHash = new MaglevHash(["node1", "node2"]);
    const results = nodesFor1To30(maglevHash);

    expect(results.node1).toEqual([3, 5, 8, 11, 12, 14, 18, 19, 20, 22, 27, 28, 29]);
    expect(results.node2).toEqual([1, 2, 4, 6, 7, 9, 10, 13, 15, 16, 17, 21, 23, 24, 25, 26, 30]);
  });

  it("three nodes", () => {
    const maglevHash = new MaglevHash(["node1", "node2", "node3"]);
    const results = nodesFor1To30(maglevHash);

    expect(results.node1).toEqual([5, 18, 20, 22, 27, 28, 29]);
    expect(results.node2).toEqual([1, 2, 4, 7, 9, 10, 13, 15, 21, 23, 26, 30]);
    expect(results.node3).toEqual([3, 6, 8, 11, 12, 14, 16, 17, 19, 24, 25]);
  });

  it("four nodes", () => {
    const maglevHash = new MaglevHash(["node1", "node2", "node3", "node4"]);
    const results = nodesFor1To30(maglevHash);

    expect(results.node1).toEqual([5, 18, 20, 27, 29]);
    expect(results.node2).toEqual([1, 2, 4, 7, 9, 10, 13, 21, 23, 26, 30]);
    expect(results.node3).toEqual([6, 14, 16, 17, 19, 24, 25]);
    expect(results.node4).toEqual([3, 8, 11, 12, 15, 22, 28]);
  });

  it("five nodes", () => {
    const maglevHash = new MaglevHash(["node1", "node2", "node3", "node4", "node5"]);
    const results = nodesFor1To30(maglevHash);

    expect(results.node1).toEqual([5, 18, 27, 29]);
    expect(results.node2).toEqual([1, 2, 4, 9, 10, 13, 21, 23, 26, 30]);
    expect(results.node3).toEqual([6, 14, 16, 17, 19, 25]);
    expect(results.node4).toEqual([8, 11, 12, 15, 22, 28]);
    expect(results.node5).toEqual([3, 7, 20, 24]);
  });

  it("node count limits", () => {
    expect(() => new MaglevHash([])).toThrow(ArgumentError);
    expect(() => new MaglevHash(Array.from({ length: 2053 }, (_, i) => String(i)))).not.toThrow();
    expect(() => new MaglevHash(Array.from({ length: 2054 }, (_, i) => String(i)))).toThrow(
      ArgumentError,
    );
  });
});
