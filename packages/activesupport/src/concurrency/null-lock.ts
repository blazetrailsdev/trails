export const NullLock = {
  async synchronize<T>(block: () => T | Promise<T>): Promise<T> {
    return block();
  },
};

export type NullLock = typeof NullLock;
