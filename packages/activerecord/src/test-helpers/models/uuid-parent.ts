import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { UuidChild } from "./uuid-child.js";
import { Base } from "../../base.js";

export class UuidParent extends Base {
  declare uuidChildren: AssociationProxy<UuidChild>;

  static {
    this.hasMany("uuidChildren");
  }
}
