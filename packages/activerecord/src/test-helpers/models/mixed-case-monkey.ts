import type { Human } from "./human.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MixedCaseMonkey extends Base {
  declare fleaCount: number;
  declare monkeyID: number;

  static _primaryKey = "monkeyID";

  static {
    this.belongsTo("human");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MixedCaseMonkey {
  get human(): Human | null | Promise<Human | null>;
  set human(value: Human | null);
}
