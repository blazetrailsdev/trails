export class Unmanaged {
  withEach<T>(block: () => T): T {
    return block();
  }

  with<T>(_name: unknown, block: () => T): T {
    return block();
  }

  withConnectionFor<T>(_key: unknown, block: () => T): T {
    return block();
  }

  assign<K>(keys: K[]): Map<string, K[]> {
    return new Map([["default", keys]]);
  }

  count(): number {
    return 1;
  }

  get names(): string[] {
    return ["default"];
  }
}
