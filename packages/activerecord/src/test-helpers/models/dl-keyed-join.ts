import type { DestroyAsyncParent } from "./destroy-async-parent.js";
import type { DlKeyedHasManyThrough } from "./dl-keyed-has-many-through.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DlKeyedJoin extends Base {
  declare destroy_async_parent_id: number;
  declare dl_keyed_has_many_through_id: number;
  declare joins_key: number;

  static _primaryKey = "joins_key";

  static {
    this.belongsTo("destroyAsyncParent", { primaryKey: "parent_id" });
    this.belongsTo("dlKeyedHasManyThrough", { primaryKey: "through_key" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DlKeyedJoin {
  get dlKeyedHasManyThrough(): DlKeyedHasManyThrough | null | Promise<DlKeyedHasManyThrough | null>;
  set dlKeyedHasManyThrough(value: DlKeyedHasManyThrough | null);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DlKeyedJoin {
  get destroyAsyncParent(): DestroyAsyncParent | null | Promise<DestroyAsyncParent | null>;
  set destroyAsyncParent(value: DestroyAsyncParent | null);
}
