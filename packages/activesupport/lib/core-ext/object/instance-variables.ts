export class Object {
  static instanceValues(self: object): Record<string, unknown> {
    return globalThis.Object.fromEntries(
      globalThis.Object.keys(self).map((ivar) => [
        ivar,
        (self as globalThis.Record<string, unknown>)[ivar],
      ]),
    );
  }

  static instanceVariableNames(self: object): string[] {
    return globalThis.Object.keys(self).map((ivar) => ivar);
  }
}
