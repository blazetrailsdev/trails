import "./class-paths.variant-record.generated.js";
import type { Extended } from "@blazetrails/activesupport";
import { runLoadHooks } from "@blazetrails/activesupport";
import type { ClassMethods } from "./attached/model.js";
import { ActiveStorage } from "./active-storage.js";
import type { One } from "./attached/one.js";
import { Record } from "./record.js";

export class VariantRecord extends Record {
  declare variation_digest: string;
  declare image: One;

  static {
    this.belongsTo("blob");
    (this as unknown as Extended<typeof ClassMethods>).hasOneAttached("image");
  }
}

ActiveStorage.VariantRecord = VariantRecord;

runLoadHooks("active_storage_variant_record", VariantRecord);
