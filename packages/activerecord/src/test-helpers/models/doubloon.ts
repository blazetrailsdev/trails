import type { Pirate } from "./pirate.js";
// vendor/rails/activerecord/test/models/doubloon.rb
import { Base } from "../../base.js";

export class AbstractDoubloon extends Base {
  declare pirate: Pirate | null;
  declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;

  static abstractClass = true;

  static {
    this.belongsTo("pirate");
  }
}

export class Doubloon extends AbstractDoubloon {
  declare pirate_id: number;
  declare weight: number;

  static _tableName = "doubloons";
}
