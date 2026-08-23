import { describe, expect, it } from "vitest";
import { assertAsyncEqual } from "./async-helper.js";

describe("AsyncHelper#assert_async_equal", () => {
  it("unwraps the promise and compares the value", async () => {
    await assertAsyncEqual(3, Promise.resolve(3));
  });

  it("fails when the value differs", async () => {
    await expect(assertAsyncEqual(3, Promise.resolve(4))).rejects.toThrow();
  });

  it("fails when the result is not a promise", async () => {
    await expect(assertAsyncEqual(3, 3)).rejects.toThrow(/ActiveRecord::Promise/);
  });

  it("takes the assert_nil arm when expected is nil", async () => {
    await assertAsyncEqual(null, Promise.resolve(null));
    await expect(assertAsyncEqual(null, Promise.resolve(0))).rejects.toThrow();
  });
});
