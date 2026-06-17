import type { DestroyAsyncParentSoftDelete } from "./destroy-async-parent-soft-delete.js";
// vendor/rails/activerecord/test/models/dl_keyed_belongs_to_soft_delete.rb
// Rails uses dependent: :destroy_async + ensuring_owner_was: :deleted?.
// Both options require the type union to include "destroyAsync"; using "destroy" until widened.
import { Base } from "../../base.js";

export class DlKeyedBelongsToSoftDelete extends Base {
  declare destroyAsyncParentSoftDelete: DestroyAsyncParentSoftDelete | null;
  declare loadBelongsTo: (
    name: "destroyAsyncParentSoftDelete",
  ) => Promise<DestroyAsyncParentSoftDelete | null>;
  declare deleted: boolean;
  declare destroy_async_parent_soft_delete_id: number;

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
