import { Base } from "@blazetrails/activerecord";
import { runLoadHooks } from "@blazetrails/activesupport";
import { constSet, toEnum, type Enumerator } from "@blazetrails/ruby-compat";
import { SolidCache } from "./solid-cache.js";

export class Record extends Base {
  static {
    this.abstractClass = true;
  }

  static withShard<T>(shard: string | null | undefined, block: () => T): T {
    if (shard && SolidCache.configuration.isSharded()) {
      return this.connectedTo({ shard, role: this.defaultRole, preventWrites: false }, block);
    } else {
      return block();
    }
  }

  static eachShard(): Enumerator;
  static eachShard(block: () => unknown): Promise<void>;
  static eachShard(block?: () => unknown): Promise<void> | Enumerator {
    if (!block) return toEnum(this, "eachShard");

    return (async () => {
      if (SolidCache.configuration.isSharded()) {
        for (const shard of SolidCache.configuration.shardKeys()) {
          await Record.withShard(shard, block);
        }
      } else {
        await block();
      }
    })();
  }
}

constSet(SolidCache, "Record", Record);

runLoadHooks("solid_cache", Record);
