import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Developer } from "./developer.js";
import { Base } from "../../base.js";

export class Mentor extends Base {
  declare developers: AssociationProxy<Developer>;
  declare name: string;

  static {
    this.hasMany("developers");
  }
}
constSet(TopLevel, "Mentor", Mentor);
DescendantsTracker.registerSubclass(Base, Mentor);
