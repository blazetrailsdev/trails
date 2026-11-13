import { Base } from "@blazetrails/activerecord";
import { constSet } from "@blazetrails/ruby-compat";
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

  static async eachShard(block: () => unknown): Promise<void> {
    if (SolidCache.configuration.isSharded()) {
      for (const shard of SolidCache.configuration.shardKeys()) {
        await Record.withShard(shard, block);
      }
    } else {
      await block();
    }
  }
}

constSet(SolidCache, "Record", Record);
