const thenlessViews = new WeakMap<object, object>();
const thenlessViewSet = new WeakSet<object>();

/** @noRailsEquivalent PERMANENT */
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
