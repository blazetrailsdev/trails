import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Electron } from "./electron.js";
import type { Liquid } from "./liquid.js";
// vendor/rails/activerecord/test/models/molecule.rb
import { Base } from "../../base.js";

export class Molecule extends Base {
  declare liquid: Liquid | null;
  declare electrons: AssociationProxy<Electron>;
  declare loadBelongsTo: (name: "liquid") => Promise<Liquid | null>;
  declare liquid_id: number;
  declare name: string;

  static {
    this.belongsTo("liquid");
    this.hasMany("electrons");
  }
}
