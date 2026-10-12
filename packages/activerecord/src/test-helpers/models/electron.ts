import type { Molecule } from "./molecule.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Electron extends Base {
  declare molecule_id: number;
  declare name: string;

  static {
    this.belongsTo("molecule");

    this.validatesPresenceOf("name");
  }
}
registerModel(Electron);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Electron {
  get molecule(): Molecule | null | Promise<Molecule | null>;
  set molecule(value: Molecule | null);
}
