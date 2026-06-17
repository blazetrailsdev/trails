import type { Guitar } from "./guitar.js";
// vendor/rails/activerecord/test/models/tuning_peg.rb
import { Base } from "../../base.js";

export class TuningPeg extends Base {
  declare guitar: Guitar | null;
  declare loadBelongsTo: (name: "guitar") => Promise<Guitar | null>;
  declare guitar_id: number;
  declare pitch: number;

  static {
    this.belongsTo("guitar");
    this.validatesNumericalityOf("pitch");
  }
}
