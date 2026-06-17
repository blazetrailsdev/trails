import type { Human } from "./human.js";
// vendor/rails/activerecord/test/models/mixed_case_monkey.rb
import { Base } from "../../base.js";

export class MixedCaseMonkey extends Base {
  declare human: Human | null;
  declare loadBelongsTo: (name: "human") => Promise<Human | null>;
  declare fleaCount: number;
  declare monkeyID: number;

  static _primaryKey = "monkeyID";

  static {
    this.belongsTo("human");
  }
}
