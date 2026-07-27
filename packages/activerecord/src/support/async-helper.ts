import { expect } from "vitest";

/** Mirrors: AsyncHelper#assert_async_equal */
export async function assertAsyncEqual(expected: unknown, asyncResult: unknown): Promise<void> {
  const message = `Expected to return an ActiveRecord::Promise, got: ${String(asyncResult)}`;
  expect(typeof (asyncResult as { then?: unknown })?.then === "function", message).toBe(true);

  const value = await (asyncResult as Promise<unknown>);
  if (expected === null || expected === undefined) {
    expect(value).toBeNull();
  } else {
    expect(value).toEqual(expected);
  }
}
