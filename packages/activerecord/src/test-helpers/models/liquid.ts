import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Molecule } from "./molecule.js";
import { Base } from "../../base.js";

export class Liquid extends Base {
  declare molecules: AssociationProxy<Molecule>;

  static _tableName = "liquid";

  static {
    this.hasMany("molecules", function () {
      return this.distinct();
    });
  }
}
constSet(TopLevel, "Liquid", Liquid);
DescendantsTracker.registerSubclass(Base, Liquid);
