// vendor/rails/activerecord/test/models/dl_keyed_join.rb
import { Base } from "../../base.js";

export class DlKeyedJoin extends Base {
  static _primaryKey = "joins_key";

  static {
    this.belongsTo("destroyAsyncParent", { primaryKey: "parent_id" });
    this.belongsTo("dlKeyedHasManyThrough", { primaryKey: "through_key" });
  }
}
