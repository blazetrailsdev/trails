import type { UuidParent } from "./uuid-parent.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidChild extends Base {
  static {
    this.belongsTo("uuidParent");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidChild {
  get uuidParent(): UuidParent | null | Promise<UuidParent | null>;
  set uuidParent(value: UuidParent | null);
}
