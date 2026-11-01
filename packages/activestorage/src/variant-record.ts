import "./class-paths.variant-record.generated.js";
import type { Extended } from "@blazetrails/activesupport";
import { runLoadHooks } from "@blazetrails/activesupport";
import type { ClassMethods } from "./attached/model.js";
import { Record } from "./record.js";

export class VariantRecord extends Record {
  static {
    this.belongsTo("blob");
    (this as unknown as Extended<typeof ClassMethods>).hasOneAttached("image");
  }
}

runLoadHooks("active_storage_variant_record", VariantRecord);
