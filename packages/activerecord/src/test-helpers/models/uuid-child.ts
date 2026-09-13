import type { UuidParent } from "./uuid-parent.js";
import { Base } from "../../base.js";

export class UuidChild extends Base {
  static {
    this.belongsTo("uuidParent");
  }
}
export interface UuidChild {
  get uuidParent(): UuidParent | null | Promise<UuidParent | null>;
  set uuidParent(value: UuidParent | null);
}
