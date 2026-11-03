import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ShardedRecord } from "./sharded-record.js";

export class ShardedJobResult extends ShardedRecord {
  declare value: string | null;
}
constSet(TopLevel, "ShardedJobResult", ShardedJobResult);
