import { registerModel } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.js";

export class ShardedRecord extends ApplicationRecord {
  static {
    this.abstractClass = true;

    this.connectsTo({
      shards: {
        shard_one: { writing: ":shard_one" },
        shard_two: { writing: ":shard_two" },
      },
    });
  }
}
registerModel(ShardedRecord);
