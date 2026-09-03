/** @noRailsEquivalent CONVERGEABLE converge-relation-deferred-and-thenable-machinery */

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
