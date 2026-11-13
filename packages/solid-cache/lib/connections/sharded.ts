import { MaglevHash } from "../maglev-hash.js";
import { Record } from "../record.js";

export class Sharded {
  readonly names: string[];
  readonly nodes: string[] | null = null;
  readonly consistentHash: MaglevHash;

  constructor(names: string[]) {
    this.names = names;
    this.consistentHash = new MaglevHash(names);
  }

  async withEach(block: () => unknown): Promise<void> {
    for (const name of this.names) await this.with(name, block);
  }

  with<T>(name: string, block: () => T): T {
    return Record.withShard(name, block);
  }

  withConnectionFor<T>(key: unknown, block: () => T): T {
    return this.with(this.shardFor(key), block);
  }

  assign<K>(keys: K[]): Map<string, K[]> {
    const groups = new Map<string, K[]>();
    for (const key of keys) {
      const shard = this.shardFor(
        key != null && typeof key === "object" && "key" in key ? key.key : key,
      );
      let group = groups.get(shard);
      if (!group) groups.set(shard, (group = []));
      group.push(key);
    }
    return groups;
  }

  count(): number {
    return this.names.length;
  }

  /** @internal */
  private shardFor(key: unknown): string {
    return this.consistentHash.node(key);
  }
}
