import type { UuidParent } from "./uuid-parent.js";
import { Base } from "../../base.js";

export class UuidChild extends Base {
  declare uuidParent: UuidParent | null;
  declare loadBelongsTo: (name: "uuidParent") => Promise<UuidParent | null>;

  static {
    this.belongsTo("uuidParent");
  }
}
