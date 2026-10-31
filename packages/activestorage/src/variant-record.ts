import { runLoadHooks } from "@blazetrails/activesupport";
import { Record } from "./record.js";

export class VariantRecord extends Record {
  static {
    this.belongsTo("blob");
  }
}

runLoadHooks("active_storage_variant_record", VariantRecord);
