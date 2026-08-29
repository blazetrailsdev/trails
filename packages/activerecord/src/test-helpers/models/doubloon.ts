import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";

export class AbstractDoubloon extends Base {
  declare pirate: Pirate | null;
  declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;

  static {
    this.abstractClass = true;
    this.belongsTo("pirate");
  }
}

export class Doubloon extends AbstractDoubloon {
  declare pirate_id: number;
  declare weight: number;

  static _tableName = "doubloons";
}
