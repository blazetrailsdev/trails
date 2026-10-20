import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Molecule } from "./molecule.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Liquid extends Base {
  declare molecules: AssociationProxy<Molecule>;

  static _tableName = "liquid";

  static {
    this.hasMany("molecules", function () {
      return this.distinct();
    });
  }
}
registerModel(Liquid);
