import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class ShardedRecord extends ApplicationRecord {
  static {
    this.abstractClass = true;
  }
}
await ShardedRecord.connectsTo({
  shards: {
    shard_one: { writing: ":shard_one" },
    shard_two: { writing: ":shard_two" },
  },
});
constSet(TopLevel, "ShardedRecord", ShardedRecord);
