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
 * return from async functions, Promise.resolve(). This hides `.then`
 * to prevent that for objects returned as `this` (load, reload,
 * presence) or yielded (inBatches).
 *
 * The hiding happens on a *view* rather than on the instance itself.
 * Deleting `.then` in place made the original binding's runtime shape
 * diverge from its static type: `await rel` after `await rel.load()`
 * silently resolved to the relation object instead of the records,
 * with no type error. The view forwards every operation to the target,
 * so reads and writes still land on the one underlying relation —
 * Rails' "same object, now loaded" identity semantics — while leaving
 * the original awaitable.
 *
 * The view is memoized per instance, so repeated `load()` calls return
 * the same view rather than allocating on every materialization, and it
 * is idempotent: `stripThenable(view)` is the view. Idempotency is load
 * bearing, not a nicety. A method invoked *on* the view runs with `this`
 * bound to the view (the `get` trap's receiver argument only rebinds
 * accessors, not method calls), so `await (await rel.load()).load()`
 * re-enters `stripThenable` with the view — which would otherwise wrap a
 * view in a view, one layer per chained call. Rails' `load` and
 * `presence` return `self` and `reload` is `reset; load`
 * (`relation.rb:1179,1185,1189-1191`; `object/blank.rb:45-46`), so
 * chaining must land back on the same object.
 */
const thenlessViews = new WeakMap<object, object>();
const thenlessViewSet = new WeakSet<object>();

export function stripThenable<T extends object>(obj: T): Omit<T, "then"> {
  if (thenlessViewSet.has(obj)) return obj as Omit<T, "then">;

  const cached = thenlessViews.get(obj);
  if (cached) return cached as Omit<T, "then">;

  const view = new Proxy(obj, {
    get(target, prop) {
      if (prop === "then") return undefined;
      return Reflect.get(target, prop, target);
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
    has(target, prop) {
      return prop === "then" ? false : Reflect.has(target, prop);
    },
    getOwnPropertyDescriptor(target, prop) {
      return prop === "then" ? undefined : Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  thenlessViews.set(obj, view);
  thenlessViewSet.add(view);
  return view as Omit<T, "then">;
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
