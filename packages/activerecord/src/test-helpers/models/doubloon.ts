import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";

export class AbstractDoubloon extends Base {
  static {
    this.abstractClass = true;
    this.belongsTo("pirate");
  }
}
export interface AbstractDoubloon {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
}

export class Doubloon extends AbstractDoubloon {
  declare pirate_id: number;
  declare weight: number;

  static _tableName = "doubloons";
}
