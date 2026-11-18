import { describe, expect, it } from "vitest";
import { objectWith } from "../../../lib/core-ext/object/with.js";

describe("objectWith with an async block", () => {
  it("restores after the awaited block settles", async () => {
    const obj = { foo: "old" };
    let during: string | undefined;
    const done = objectWith(obj, { foo: "new" }, async () => {
      await Promise.resolve();
      during = obj.foo;
    });
    expect(obj.foo).toBe("new");
    await done;
    expect(during).toBe("new");
    expect(obj.foo).toBe("old");
  });

  it("restores after the block rejects", async () => {
    const obj = { foo: "old" };
    await expect(
      objectWith(obj, { foo: "new" }, async () => {
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(obj.foo).toBe("old");
  });
});
