import { runLoadHooks } from "@blazetrails/activesupport";
import { ClassMethods } from "./attached/model.js";
import { Record } from "./record.js";

/** @missingRailsArgs has_one_attached — CONVERGEABLE activestorage-attached-macros-run-after-boot */
export class VariantRecord extends Record {
  static {
    this.belongsTo("blob");
    ClassMethods.hasOneAttached.call(this, "image");
  }
}

runLoadHooks("active_storage_variant_record", VariantRecord);
