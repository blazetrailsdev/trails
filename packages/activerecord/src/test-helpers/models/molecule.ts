import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Electron } from "./electron.js";
import type { Liquid } from "./liquid.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Molecule extends Base {
  declare electrons: AssociationProxy<Electron>;
  declare liquid_id: number;
  declare name: string;

  static {
    this.belongsTo("liquid");
    this.hasMany("electrons");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Molecule {
  get liquid(): Liquid | null | Promise<Liquid | null>;
  set liquid(value: Liquid | null);
}

acceptsNestedAttributesFor(Molecule, "electrons");
