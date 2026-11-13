import { Connections as SolidCacheConnections } from "../connections.js";
import type { StoreHost } from "../store.js";

type Failsafe = { failsafe: string; failsafeReturning?: unknown };

export const Connections = {
  /** @missingRailsCall execute — CONVERGEABLE port-solid-cache-store-execution-and-expiry */
  async withEachConnection(this: StoreHost, block: () => unknown): Promise<unknown> {
    return await this.connections().withEach(block);
  },

  connections(this: StoreHost): ReturnType<typeof SolidCacheConnections.fromConfig> {
    return (this._connections ??= SolidCacheConnections.fromConfig(this.shardOptions));
  },

  /** @internal */
  setupBang(this: StoreHost): void {
    this.connections();
  },

  /**
   * @internal
   * @missingRailsCall execute — CONVERGEABLE port-solid-cache-store-execution-and-expiry
   */
  withConnectionFor<T>(this: StoreHost, key: unknown, block: () => T): T {
    return this.connections().withConnectionFor(key, block);
  },

  /**
   * @internal
   * @missingRailsCall execute — CONVERGEABLE port-solid-cache-store-execution-and-expiry
   */
  withConnection<T>(this: StoreHost, name: string, block: () => T): T {
    return this.connections().with(name, block);
  },

  /** @internal */
  groupByConnection(this: StoreHost, keys: unknown[]): Map<string, unknown[]> {
    return this.connections().assign(keys);
  },

  /** @internal */
  connectionNames(this: StoreHost): string[] {
    return this.connections().names;
  },

  /** @internal */
  async readingKey(
    this: StoreHost,
    key: string,
    { failsafe, failsafeReturning = null }: Failsafe,
    block: () => unknown,
  ): Promise<unknown> {
    return await this.failsafe(failsafe, { returning: failsafeReturning }, () =>
      this.withConnectionFor(key, block),
    );
  },

  /** @internal */
  async readingKeys(
    this: StoreHost,
    keys: unknown[],
    { failsafe, failsafeReturning = null }: Failsafe,
    block: (groupedKeys: unknown[]) => unknown,
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const [connection, groupedKeys] of this.groupByConnection(keys)) {
      results.push(
        await this.failsafe(failsafe, { returning: failsafeReturning }, () =>
          this.withConnection(connection, () => block(groupedKeys)),
        ),
      );
    }
    return results;
  },

  /** @internal */
  async writingKey(
    this: StoreHost,
    key: string,
    { failsafe, failsafeReturning = null }: Failsafe,
    block: () => unknown,
  ): Promise<unknown> {
    return await this.failsafe(failsafe, { returning: failsafeReturning }, () =>
      this.withConnectionFor(key, block),
    );
  },

  /** @internal */
  async writingKeys(
    this: StoreHost,
    entries: unknown[],
    { failsafe, failsafeReturning = null }: Failsafe,
    block: (groupedEntries: unknown[]) => unknown,
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const [connection, groupedEntries] of this.groupByConnection(entries)) {
      results.push(
        await this.failsafe(failsafe, { returning: failsafeReturning }, () =>
          this.withConnection(connection, () => block(groupedEntries)),
        ),
      );
    }
    return results;
  },

  /** @internal */
  async writingAll(
    this: StoreHost,
    { failsafe, failsafeReturning = null }: Failsafe,
    block: () => unknown,
  ): Promise<unknown> {
    const results: unknown[] = [];
    for (const connection of this.connectionNames()) {
      results.push(
        await this.failsafe(failsafe, { returning: failsafeReturning }, () =>
          this.withConnection(connection, block),
        ),
      );
    }
    return results[0];
  },
};
