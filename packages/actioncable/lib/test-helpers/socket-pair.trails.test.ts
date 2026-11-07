import { describe, expect, it } from "vitest";
import { socketPair } from "./socket-pair.js";

describe("socketPair", () => {
  it("writes short once the queue fills and is writable again once the peer reads it", async () => {
    const [a, b] = socketPair();
    const big = new Uint8Array(20 * 1024);
    expect(a.writeNonblock(big)).toBe(16 * 1024);
    expect(a.writeNonblock("x", { exception: false })).toBe("wait_writable");
    await expect(a.waitWritable()).resolves.toBe(a);
    expect(b.read()).toHaveLength(16 * 1024);
    expect(a.writeNonblock(big.subarray(16 * 1024))).toBe(4 * 1024);
  });
});
