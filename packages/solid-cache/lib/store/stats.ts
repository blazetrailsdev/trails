import { Time } from "@blazetrails/date";
import { Entry } from "../entry.js";
import type { StoreHost } from "../store.js";

type ConnectionStats = {
  maxAge: number | null;
  oldestAge: number | null;
  maxEntries: number | null;
  entries: unknown;
};

export const Stats = {
  async stats(
    this: StoreHost,
  ): Promise<{ connections: number; connectionStats: Record<string, ConnectionStats> }> {
    return {
      connections: this.connections().count(),
      connectionStats: await this.connectionsStats(),
    };
  },

  /** @internal */
  async connectionsStats(this: StoreHost): Promise<Record<string, ConnectionStats>> {
    const pairs: [string, ConnectionStats][] = [];
    await this.withEachConnection({}, async () => {
      pairs.push([Entry.currentShard(), await this.connectionStats()]);
    });
    return Object.fromEntries(pairs);
  },

  /** @internal */
  async connectionStats(this: StoreHost): Promise<ConnectionStats> {
    const oldestCreatedAt = await Entry.order("id").pick("created_at");

    return {
      maxAge: this.maxAge,
      oldestAge:
        oldestCreatedAt != null ? (Time.now().minus(oldestCreatedAt as Time) as number) : null,
      maxEntries: this.maxEntries,
      entries: await Entry.idRange(),
    };
  },
};
