// vendor/rails/activerecord/test/models/dl_keyed_belongs_to_soft_delete.rb
// Rails uses dependent: :destroy_async + ensuring_owner_was: :deleted?.
// Both options require the type union to include "destroyAsync"; using "destroy" until widened.
import { Base } from "../../base.js";

export class DlKeyedBelongsToSoftDelete extends Base {
  static {
    this.belongsTo("destroyAsyncParentSoftDelete", {
      dependent: "destroy",
      className: "DestroyAsyncParentSoftDelete",
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
