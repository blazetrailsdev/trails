function hiddenThen(this: object): undefined {
  if (Object.getOwnPropertyDescriptor(this, "then")?.get === hiddenThen) {
    Reflect.deleteProperty(this, "then");
  }
  return undefined;
}

/** @noRailsEquivalent PERMANENT */
export function stripThenable<T extends object>(obj: T): Omit<T, "then"> {
  if (!Object.isExtensible(obj)) {
    throw new TypeError("stripThenable: cannot hide `then` on a non-extensible object");
  }
  const own = Object.getOwnPropertyDescriptor(obj, "then");
  if (own && own.get !== hiddenThen) {
    throw new TypeError("stripThenable: cannot hide an own `then`");
  }
  if (!own) {
    Object.defineProperty(obj, "then", { configurable: true, enumerable: false, get: hiddenThen });
  }
  return obj;
}
