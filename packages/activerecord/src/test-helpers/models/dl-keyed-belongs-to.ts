// vendor/rails/activerecord/test/models/dl_keyed_belongs_to.rb
// Rails uses dependent: :destroy_async + ensuring_owner_was: :deleted? on destroyAsyncParentSoftDelete.
// Using "destroy" until AssociationOptions.dependent includes "destroyAsync".
import { Base } from "../../base.js";

export class DlKeyedBelongsTo extends Base {
  static _primaryKey = "belongs_key";

  static {
    this.belongsTo("destroyAsyncParent", {
      dependent: "destroy",
      foreignKey: "destroy_async_parent_id",
      primaryKey: "parent_id",
      className: "DestroyAsyncParent",
    });
    this.belongsTo("destroyAsyncParentSoftDelete", {
      dependent: "destroy",
      className: "DestroyAsyncParentSoftDelete",
    });
  }
}
