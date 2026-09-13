import type { Guitar } from "./guitar.js";
import { Base } from "../../base.js";

export class TuningPeg extends Base {
  declare guitar_id: number;
  declare pitch: number;

  static {
    this.belongsTo("guitar");
    this.validatesNumericalityOf("pitch");
  }
}
export interface TuningPeg {
  get guitar(): Guitar | null | Promise<Guitar | null>;
  set guitar(value: Guitar | null);
}
