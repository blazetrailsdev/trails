import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { UuidChild } from "./uuid-child.js";
import { Base } from "../../lib/base.js";

export class UuidParent extends Base {
  declare uuidChildren: AssociationProxy<UuidChild>;

  static {
    this.hasMany("uuidChildren");
  }
}
constSet(TopLevel, "UuidParent", UuidParent);
DescendantsTracker.registerSubclass(Base, UuidParent);
