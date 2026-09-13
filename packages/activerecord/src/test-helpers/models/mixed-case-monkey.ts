import type { Human } from "./human.js";
import { Base } from "../../base.js";

export class MixedCaseMonkey extends Base {
  declare human: Human | null | Promise<Human | null>;
  declare fleaCount: number;
  declare monkeyID: number;

  static _primaryKey = "monkeyID";

  static {
    this.belongsTo("human");
  }
}
