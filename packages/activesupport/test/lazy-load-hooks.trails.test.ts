import { afterEach, describe, expect, it } from "vitest";
import { onLoad, resetLoadHooks, runLoadHooks } from "../lib/lazy-load-hooks.js";

describe("runLoadHooks", () => {
  afterEach(() => resetLoadHooks());

  it("runs a hook after the promise an earlier hook returns settles", async () => {
    const ran: string[] = [];
    onLoad("serial", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      ran.push("first");
    });
    onLoad("serial", () => void ran.push("second"));

    const run = runLoadHooks("serial", {});
    expect(ran).toEqual([]);
    await run;
    expect(ran).toEqual(["first", "second"]);
  });

  it("answers the rejection of an earlier hook without running later ones", async () => {
    const ran: string[] = [];
    onLoad("rejects", async () => {
      throw new Error("boom");
    });
    onLoad("rejects", () => void ran.push("later"));

    await expect(runLoadHooks("rejects", {})).rejects.toThrow("boom");
    expect(ran).toEqual([]);
  });
});
