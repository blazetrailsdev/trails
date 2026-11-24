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
  attempt: () => T,
): T | Promise<T> {
  let count = 0;
  const isBusy = (e: unknown) =>
    handler() != null && errors.errcode(e) === SQLite3.Constants.ErrorCode.BUSY;
  const resume = async (error: unknown, wait: Promise<unknown>): Promise<T> => {
    for (;;) {
      if ((await wait) === false) throw error;
      try {
        return attempt();
      } catch (e) {
        if (!isBusy(e)) throw e;
        error = e;
        wait = Promise.resolve(handler()!(count++));
      }
    }
  };
  for (;;) {
    try {
      return attempt();
    } catch (e) {
      if (!isBusy(e)) throw e;
      const result = handler()!(count++);
      if (result instanceof Promise) return resume(e, result);
      if (result === false) throw e;
    }
  }
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
