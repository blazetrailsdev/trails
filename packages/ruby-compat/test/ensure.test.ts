import { describe, expect, it } from "vitest";
import { rbEnsure } from "../lib/ensure.js";

describe("rbEnsure", () => {
  it("returns a non-Promise thenable unconsumed and runs the ensure at once", () => {
    const log: string[] = [];
    const relation = {
      then() {
        log.push("loaded");
      },
    };
    expect(
      rbEnsure(
        () => relation,
        () => log.push("ensure"),
      ),
    ).toBe(relation);
    expect(log).toEqual(["ensure"]);
  });

  it("runs the ensure after a rejected promise and propagates the rejection", async () => {
    const log: string[] = [];
    const result = rbEnsure(
      () => Promise.reject(new Error("boom")),
      () => log.push("ensure"),
    );
    await expect(result).rejects.toThrow("boom");
    expect(log).toEqual(["ensure"]);
  });
});
