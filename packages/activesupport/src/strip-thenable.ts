function hiddenThen(this: object): undefined {
  if (Object.getOwnPropertyDescriptor(this, "then")?.get === hiddenThen) {
    Reflect.deleteProperty(this, "then");
  }
  return undefined;
}

/** @noRailsEquivalent PERMANENT */
export function stripThenable<T extends object>(obj: T): Omit<T, "then"> {
  if (Object.isExtensible(obj) && !Object.hasOwn(obj, "then")) {
    Object.defineProperty(obj, "then", { configurable: true, enumerable: false, get: hiddenThen });
  }
  return obj;
}
