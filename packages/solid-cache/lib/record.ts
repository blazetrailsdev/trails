import { Base } from "@blazetrails/activerecord";
import {
  Fanout,
  Instrumenter,
  IsolatedExecutionState,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { constSet, rbObjRespondTo, toEnum, type Enumerator } from "@blazetrails/ruby-compat";
import { SolidCache } from "./solid-cache.js";

export class Record extends Base {
  static readonly NULL_INSTRUMENTER = new Instrumenter(new Fanout());

  static {
    this.abstractClass = true;
  }

  static async disableInstrumentation<T>(block: () => T | Promise<T>): Promise<T> {
    return await this.withInstrumenter(Record.NULL_INSTRUMENTER, block);
  }

  static async withInstrumenter<T>(instrumenter: unknown, block: () => T | Promise<T>): Promise<T> {
    const connection = await this.leaseConnection();
    if (rbObjRespondTo(connection, "withInstrumenter")) {
      return await (
        connection as unknown as {
          withInstrumenter(instrumenter: unknown, block: () => T | Promise<T>): Promise<T>;
        }
      ).withInstrumenter(instrumenter, block);
    } else {
      const oldInstrumenter = IsolatedExecutionState.get("active_record_instrumenter");
      IsolatedExecutionState.set("active_record_instrumenter", instrumenter);
      try {
        return await block();
      } finally {
        IsolatedExecutionState.set("active_record_instrumenter", oldInstrumenter);
      }
    }
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
