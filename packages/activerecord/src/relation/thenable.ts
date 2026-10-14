/** @noRailsEquivalent PERMANENT */
export function applyThenable(prototype: object): void {
  const def = { writable: true, configurable: true, enumerable: false };

  Object.defineProperties(prototype, {
    then: {
      ...def,
      value(
        this: any,
        onfulfilled?: ((value: any) => any) | null,
        onrejected?: ((reason: any) => any) | null,
      ) {
        return this.toArray().then(onfulfilled, onrejected);
      },
    },
    catch: {
      ...def,
      value(this: any, onrejected?: ((reason: any) => any) | null) {
        return this.toArray().catch(onrejected);
      },
    },
    finally: {
      ...def,
      value(this: any, onfinally?: (() => void) | null) {
        return this.toArray().finally(onfinally);
      },
    },
  });
}
