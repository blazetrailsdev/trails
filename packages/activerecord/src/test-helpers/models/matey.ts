import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";

export class Matey extends Base {
  declare pirate: Pirate | null;
  declare target: Pirate | null;
  declare loadBelongsTo: ((name: "pirate") => Promise<Pirate | null>) &
    ((name: "target") => Promise<Pirate | null>);
  declare pirate_id: number;
  declare target_id: number;
  declare weight: number;

  static _primaryKey = "";

  static {
    this.belongsTo("pirate");
    this.belongsTo("target", { className: "Pirate" });
  }
}
