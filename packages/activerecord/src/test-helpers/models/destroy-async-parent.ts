// vendor/rails/activerecord/test/models/destroy_async_parent.rb
// Rails uses dependent: :destroy_async on all associations.
// Using "destroy" until AssociationOptions.dependent includes "destroyAsync".
import { Base } from "../../base.js";

export class DestroyAsyncParent extends Base {
  static _primaryKey = "parent_id";

  static {
    this.hasOne("dlKeyedHasOne", {
      dependent: "destroy",
      foreignKey: "destroy_async_parent_id",
      primaryKey: "parent_id",
    });
    this.hasMany("dlKeyedHasMany", {
      dependent: "destroy",
      foreignKey: "many_key",
      primaryKey: "parent_id",
    });
    this.hasMany("dlKeyedJoin", {
      dependent: "destroy",
      foreignKey: "destroy_async_parent_id",
      primaryKey: "parent_id",
    });
    this.hasMany("dlKeyedHasManyThrough", {
      through: "dlKeyedJoin",
      dependent: "destroy",
      foreignKey: "dl_has_many_through_key_id",
      primaryKey: "through_key",
    });
  }
}
