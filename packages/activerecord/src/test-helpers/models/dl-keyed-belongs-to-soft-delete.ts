import type { DestroyAsyncParentSoftDelete } from "./destroy-async-parent-soft-delete.js";
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
