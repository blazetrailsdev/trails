/**
 * `rb_ensure` (`vendor/ruby/v3.3.11/eval.c:995`), the body of a Ruby
 * `begin … ensure … end`: run `bProc`, then `eProc` whether it returned or
 * raised.
 *
 * A Ruby block that waits blocks its thread, so the block has completed when
 * it returns. An async block returns a pending promise at its first `await`,
 * so `eProc` runs when that promise settles.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_ensure` (`vendor/ruby/v3.3.11/eval.c:995`).
 */
export function rbEnsure<T>(bProc: () => T, eProc: () => void): T {
  let result: T;
  try {
    result = bProc();
  } catch (error) {
    eProc();
    throw error;
  }
  if (result instanceof Promise) return result.finally(eProc) as T;
  eProc();
  return result;
}
