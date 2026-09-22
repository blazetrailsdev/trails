import { describe, it, expect } from "vitest";

import { assertCalled, assertCalledWith } from "./method-call-assertions.js";

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

describe("assertCalledWith", () => {
  it("rejects a call beyond the one expectation", () => {
    const object = { foo: (_x: number) => "original" };
    expect(() =>
      assertCalledWith(object, "foo", [1], {}, () => {
        object.foo(1);
        object.foo(1);
      }),
    ).toThrow("No more expects available for :foo: 1");
    expect(object.foo(1)).toBe("original");
  });

  it("compares arguments with Ruby ==", () => {
    const object = { foo: (_h: object) => "original" };
    assertCalledWith(object, "foo", [{ a: 1 }], {}, () => {
      object.foo(Object.assign(Object.create(null), { a: 1 }));
    });
  });

  it("verifies after an async block settles", async () => {
    const object = { foo: (_x: number) => "original" };
    await expect(
      assertCalledWith(object, "foo", [1], {}, async () => {
        await Promise.resolve();
        object.foo(2);
      }),
    ).rejects.toThrow("Expected call with [1], got [2]");
  });
});
