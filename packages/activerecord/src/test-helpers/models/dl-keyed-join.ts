import type { DestroyAsyncParent } from "./destroy-async-parent.js";
import type { DlKeyedHasManyThrough } from "./dl-keyed-has-many-through.js";
// vendor/rails/activerecord/test/models/dl_keyed_join.rb
import { Base } from "../../base.js";

export class DlKeyedJoin extends Base {
  declare destroyAsyncParent: DestroyAsyncParent | null;
  declare dlKeyedHasManyThrough: DlKeyedHasManyThrough | null;
  declare loadBelongsTo: ((name: "destroyAsyncParent") => Promise<DestroyAsyncParent | null>) &
    ((name: "dlKeyedHasManyThrough") => Promise<DlKeyedHasManyThrough | null>);
  declare destroy_async_parent_id: number;
  declare dl_keyed_has_many_through_id: number;
  declare joins_key: number;

  static _primaryKey = "joins_key";

  static {
    this.belongsTo("destroyAsyncParent", { primaryKey: "parent_id" });
    this.belongsTo("dlKeyedHasManyThrough", { primaryKey: "through_key" });
  }
}
