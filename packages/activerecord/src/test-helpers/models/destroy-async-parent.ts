import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { DlKeyedHasMany } from "./dl-keyed-has-many.js";
import type { DlKeyedHasManyThrough } from "./dl-keyed-has-many-through.js";
import type { DlKeyedHasOne } from "./dl-keyed-has-one.js";
import type { DlKeyedJoin } from "./dl-keyed-join.js";
// vendor/rails/activerecord/test/models/destroy_async_parent.rb
// Rails uses dependent: :destroy_async on all associations.
// Using "destroy" until AssociationOptions.dependent includes "destroyAsync".
import { Base } from "../../base.js";

export class DestroyAsyncParent extends Base {
  declare dlKeyedHasOne: DlKeyedHasOne | null;
  declare dlKeyedHasMany: AssociationProxy<DlKeyedHasMany>;
  declare dlKeyedJoin: AssociationProxy<DlKeyedJoin>;
  declare dlKeyedHasManyThrough: AssociationProxy<DlKeyedHasManyThrough>;
  declare loadHasOne: (name: "dlKeyedHasOne") => Promise<DlKeyedHasOne | null>;
  declare name: string;
  declare parent_id: number;
  declare tags_count: number | null;

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
