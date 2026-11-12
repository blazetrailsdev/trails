import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import "../../lib/destroy-association-async-job.js";
import type { DestroyAsyncParentSoftDelete } from "./destroy-async-parent-soft-delete.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DlKeyedBelongsToSoftDelete extends Base {
  declare deleted: boolean;
  declare destroy_async_parent_soft_delete_id: number;

  static {
    this.belongsTo("destroyAsyncParentSoftDelete", {
      dependent: "destroyAsync",
      ensuringOwnerWas: "isDeleted",
      className: "DestroyAsyncParentSoftDelete",
    });
  }

  isDeleted() {
    return this.deleted;
  }

  async destroy(): Promise<this | false> {
    await this.update({ deleted: true });
    await this.runCallbacks("destroy", () => {});
    return this;
  }
}
constSet(TopLevel, "DlKeyedBelongsToSoftDelete", DlKeyedBelongsToSoftDelete);
DescendantsTracker.registerSubclass(Base, DlKeyedBelongsToSoftDelete);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DlKeyedBelongsToSoftDelete {
  get destroyAsyncParentSoftDelete():
    | DestroyAsyncParentSoftDelete
    | null
    | Promise<DestroyAsyncParentSoftDelete | null>;
  set destroyAsyncParentSoftDelete(value: DestroyAsyncParentSoftDelete | null);
}
