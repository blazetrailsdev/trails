/**
 * TS mirror of Rails' test-support `AsyncHelper`
 * (activerecord/test/support/async_helper.rb).
 */

import { expect } from "vitest";

/**
 * Mirrors: AsyncHelper#assert_async_equal
 *
 *   def assert_async_equal(expected, async_result)
 *     message = "Expected to return an ActiveRecord::Promise, got: #{async_result.inspect}"
 *     assert_equal(true, ActiveRecord::Promise === async_result, message)
 *
 *     if expected.nil?
 *       assert_nil async_result.value
 *     else
 *       assert_equal expected, async_result.value
 *     end
 *   end
 *
 * trails has no `ActiveRecord::Promise` wrapper — the `async*` methods return
 * the platform promise directly, so the type assertion checks thenability and
 * `.value` becomes the awaited result. The nil arm stays distinct from the
 * equality arm exactly as in Rails: `assert_nil` accepts only nil, whereas
 * `assert_equal expected, nil` would pass for a nil `expected`.
 */
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
