/**
 * Thenable mixin — makes lazy query objects directly awaitable.
 *
 * Adds `.then()`, `.catch()`, and `.finally()` to a prototype,
 * delegating to the specified evaluation method. This implements
 * the PromiseLike protocol so `await relation` triggers evaluation.
 *
 * Mirrors how Rails relations implicitly evaluate when iterated.
 */

/**
 * Shadow `.then` on a specific instance so that `yield` in an async
 * generator or `resolve()` in a Promise does not unwrap it.
 *
 * JavaScript unwraps thenables everywhere in async contexts — yield,
 * return from async functions, Promise.resolve(). This shadows `.then`
 * with `undefined` on the instance to prevent that for objects returned
 * as `this` (load, reload, presence) or yielded (inBatches).
 */
export function stripThenable<T extends object>(obj: T): T {
  Object.defineProperty(obj, "then", {
    value: undefined,
    writable: true,
    configurable: true,
  });
  return obj;
}

export function applyThenable(prototype: object, evaluationMethod: string = "toArray"): void {
  if (typeof (prototype as any)[evaluationMethod] !== "function") {
    const name = (prototype as any).constructor?.name ?? "unknown";
    throw new Error(`applyThenable: ${name}.prototype.${evaluationMethod} is not a function`);
  }

  const def = { writable: true, configurable: true, enumerable: false };

  Object.defineProperties(prototype, {
    then: {
      ...def,
      value(
        this: any,
        onfulfilled?: ((value: any) => any) | null,
        onrejected?: ((reason: any) => any) | null,
      ) {
        return this[evaluationMethod]().then(onfulfilled, onrejected);
      },
    },
    catch: {
      ...def,
      value(this: any, onrejected?: ((reason: any) => any) | null) {
        return this[evaluationMethod]().catch(onrejected);
      },
    },
    finally: {
      ...def,
      value(this: any, onfinally?: (() => void) | null) {
        return this[evaluationMethod]().finally(onfinally);
      },
    },
  });
}
