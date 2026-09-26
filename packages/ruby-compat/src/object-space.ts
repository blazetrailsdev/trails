const finalizers = new FinalizationRegistry<() => void>((aProc) => aProc());

/** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
export const ObjectSpace = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
  defineFinalizer(obj: object, aProc: () => void): [number, () => void] {
    finalizers.register(obj, aProc);
    return [0, aProc];
  },
};
