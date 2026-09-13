import type { Guitar } from "./guitar.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TuningPeg extends Base {
  declare guitar_id: number;
  declare pitch: number;

  static {
    this.belongsTo("guitar");
    this.validatesNumericalityOf("pitch");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TuningPeg {
  get guitar(): Guitar | null | Promise<Guitar | null>;
  set guitar(value: Guitar | null);
}
