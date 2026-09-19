import { describe, it, expect } from "vitest";

import { assertCalled } from "./method-call-assertions.js";

describe("assertCalled with an async block", () => {
  it("restores the stub only after the block settles", async () => {
    const object = { foo: () => "original" };
    await assertCalled(object, "foo", null, { returns: "stubbed" }, async () => {
      await Promise.resolve();
      expect(object.foo()).toBe("stubbed");
    });
    expect(object.foo()).toBe("original");
  });

  it("fails when the async block does not call the method", async () => {
    const object = { foo: () => "original" };
    await expect(assertCalled(object, "foo", null, {}, async () => {})).rejects.toThrow(
      "Expected foo to be called 1 times, but was called 0 times",
    );
  });
});
