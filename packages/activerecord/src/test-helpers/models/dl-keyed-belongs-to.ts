import type { DestroyAsyncParent } from "./destroy-async-parent.js";
import type { DestroyAsyncParentSoftDelete } from "./destroy-async-parent-soft-delete.js";
import { Base } from "../../base.js";

export class DlKeyedBelongsTo extends Base {
  declare belongs_key: number;
  declare destroy_async_parent_id: number;

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
export interface DlKeyedBelongsTo {
  get destroyAsyncParentSoftDelete():
    | DestroyAsyncParentSoftDelete
    | null
    | Promise<DestroyAsyncParentSoftDelete | null>;
  set destroyAsyncParentSoftDelete(value: DestroyAsyncParentSoftDelete | null);
}
export interface DlKeyedBelongsTo {
  get destroyAsyncParent(): DestroyAsyncParent | null | Promise<DestroyAsyncParent | null>;
  set destroyAsyncParent(value: DestroyAsyncParent | null);
}
