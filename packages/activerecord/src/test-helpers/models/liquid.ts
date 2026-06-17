import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Molecule } from "./molecule.js";
// vendor/rails/activerecord/test/models/liquid.rb
import { Base } from "../../base.js";

export class Liquid extends Base {
  declare molecules: AssociationProxy<Molecule>;

  static _tableName = "liquid";

  static {
    this.hasMany("molecules", { scope: (q: any) => q.distinct() });
  }
}
