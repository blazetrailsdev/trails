export class NullLock {
  synchronize<T>(fn: () => T): T {
    return fn();
  }
}
