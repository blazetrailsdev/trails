import type { Molecule } from "./molecule.js";
import { Base } from "../../base.js";

export class Electron extends Base {
  declare molecule_id: number;
  declare name: string;

  static {
    this.belongsTo("molecule");

    this.validatesPresenceOf("name");
  }
}
export interface Electron {
  get molecule(): Molecule | null | Promise<Molecule | null>;
  set molecule(value: Molecule | null);
}
