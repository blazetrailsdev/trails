import { registerModel } from "@blazetrails/activerecord";
import { ShardedRecord } from "./sharded-record.js";

export class ShardedJobResult extends ShardedRecord {
  declare value: string | null;
}
registerModel(ShardedJobResult);
