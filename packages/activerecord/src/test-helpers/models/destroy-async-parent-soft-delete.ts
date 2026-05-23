// vendor/rails/activerecord/test/models/destroy_async_parent_soft_delete.rb
// Rails uses dependent: :destroy_async + ensuring_owner_was: :deleted? on tags/dlKeyedHasOne.
// Both options require the type union to include "destroyAsync"; using "destroy" until widened.
import { Base } from "../../base.js";

export class DestroyAsyncParentSoftDelete extends Base {
  static {
    this.hasMany("taggings", { as: "taggable", className: "Tagging" });
    this.hasMany("tags", {
      through: "taggings",
      dependent: "destroy",
    });
    this.hasOne("dlKeyedHasOne", {
      dependent: "destroy",
    });
  }

  isDeleted() {
    return (this as any).deleted;
  }

  async destroy(): Promise<this | false> {
    await (this as any).update({ deleted: true });
    await (this as any).runCallbacks("destroy", () => {});
    return this;
  }
}
