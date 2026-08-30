export class NullLock {
  async synchronize<T>(block: () => T | Promise<T>): Promise<T> {
    return block();
  }
}
