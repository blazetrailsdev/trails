import { describe, expect, it } from "vitest";
import { rbEnsure } from "../lib/ensure.js";

describe("rbEnsure", () => {
  it("runs the ensure after a non-Promise thenable settles", async () => {
    const log: string[] = [];
    const thenable = {
      then(resolve: (v: string) => void) {
        setTimeout(() => {
          log.push("body");
          resolve("done");
        }, 0);
      },
    };
    const result = rbEnsure(
      () => thenable,
      () => log.push("ensure"),
    );
    expect(log).toEqual([]);
    expect(await result).toBe("done");
    expect(log).toEqual(["body", "ensure"]);
  });
});
