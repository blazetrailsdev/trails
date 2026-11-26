import { SQLite3 } from "../namespaces.js";
import "../constants.js";
import type { BusyHandler, EngineErrors } from "../database.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function withBusyHandler<T>(
  errors: EngineErrors,
  handler: () => BusyHandler | null,
  attempt: () => T | Promise<T>,
): T | Promise<T> {
  let count = 0;
  const isBusy = (e: unknown) =>
    handler() != null &&
    errors.errcode(e) === SQLite3.Constants.ErrorCode.BUSY &&
    errors.isDeadlock?.(e) !== true;
  const resume = async (error: unknown, wait: unknown): Promise<T> => {
    if ((await wait) === false) throw error;
    return run();
  };
  const run = (): T | Promise<T> => {
    for (;;) {
      let result: T | Promise<T>;
      try {
        result = attempt();
      } catch (e) {
        if (!isBusy(e)) throw e;
        const wait = handler()!(count++);
        if (wait instanceof Promise) return resume(e, wait);
        if (wait === false) throw e;
        continue;
      }
      if (!(result instanceof Promise)) return result;
      return result.catch((e: unknown) => {
        if (!isBusy(e)) throw e;
        return resume(e, handler()!(count++));
      });
    }
  };
  return run();
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function drive<T>(body: Generator<unknown, T, unknown>): T | Promise<T> {
  let step = body.next();
  while (!step.done) {
    const value = step.value;
    if (value instanceof Promise) {
      return (async () => {
        let next: IteratorResult<unknown, T>;
        try {
          next = body.next(await value);
        } catch (e) {
          next = body.throw(e);
        }
        while (!next.done) {
          try {
            next = body.next(await next.value);
          } catch (e) {
            next = body.throw(e);
          }
        }
        return next.value;
      })();
    }
    step = body.next(value);
  }
  return step.value;
}
