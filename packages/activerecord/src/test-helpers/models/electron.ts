import type { Molecule } from "./molecule.js";
import { Base } from "../../base.js";

export class Electron extends Base {
  declare molecule: Molecule | null;
  declare loadBelongsTo: (name: "molecule") => Promise<Molecule | null>;
  declare molecule_id: number;
  declare name: string;

  static {
    this.belongsTo("molecule");

    this.validatesPresenceOf("name");
  }
}
