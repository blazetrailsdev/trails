import { describe, expect, it } from "vitest";
import { with as with_ } from "../../../lib/core-ext/object/with.js";

describe("with with an async block", () => {
  it("restores after the awaited block settles", async () => {
    const obj = {
      _foo: "old",
      get foo() {
        return this._foo;
      },
      set foo(value: string) {
        this._foo = value;
      },
    };
    let during: string | undefined;
    const done = with_(obj, { foo: "new" }, async () => {
      await Promise.resolve();
      during = obj.foo;
    });
    expect(obj.foo).toBe("new");
    await done;
    expect(during).toBe("new");
    expect(obj.foo).toBe("old");
  });

  it("restores after the block rejects", async () => {
    const obj = {
      _foo: "old",
      get foo() {
        return this._foo;
      },
      set foo(value: string) {
        this._foo = value;
      },
    };
    await expect(
      with_(obj, { foo: "new" }, async () => {
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(obj.foo).toBe("old");
  });
});
