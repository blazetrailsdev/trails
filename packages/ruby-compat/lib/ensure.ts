/**
 * `rb_ensure` (`vendor/ruby/v3.3.11/eval.c:995`), the body of a Ruby
 * `begin … ensure … end`: run `bProc`, then `eProc` whether it returned or
 * raised.
 *
 * A Ruby block that waits blocks its thread, so the block has completed when
 * it returns. An async block returns a pending promise at its first `await`,
 * so `eProc` runs when that promise settles. An `eProc` that returns a
 * promise is waited on before the result is answered or the error re-raised,
 * so a raise from a synchronous `bProc` then arrives as a rejected promise.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_ensure` (`vendor/ruby/v3.3.11/eval.c:995`).
 */
export function rbEnsure<T>(bProc: () => T, eProc: () => unknown): T {
  let result: T;
  try {
    result = bProc();
  } catch (error) {
    const ensured = eProc();
    if (ensured instanceof Promise) {
      return ensured.then(() => {
        throw error;
      }) as T;
    }
    throw error;
  }
  if (result instanceof Promise) return result.finally(eProc) as T;
  const ensured = eProc();
  if (ensured instanceof Promise) return ensured.then(() => result) as T;
  return result;
}
