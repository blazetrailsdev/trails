import type { DestroyAsyncParentSoftDelete } from "./destroy-async-parent-soft-delete.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DlKeyedBelongsToSoftDelete extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DlKeyedBelongsToSoftDelete {
  get destroyAsyncParentSoftDelete():
    | DestroyAsyncParentSoftDelete
    | null
    | Promise<DestroyAsyncParentSoftDelete | null>;
  set destroyAsyncParentSoftDelete(value: DestroyAsyncParentSoftDelete | null);
}
