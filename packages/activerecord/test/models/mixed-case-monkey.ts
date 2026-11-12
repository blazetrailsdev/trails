import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Human } from "./human.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MixedCaseMonkey extends Base {
  declare fleaCount: number;
  declare monkeyID: number;

  static {
    this.primaryKey = "monkeyID";
  }

  static {
    this.belongsTo("human");
  }
}
constSet(TopLevel, "MixedCaseMonkey", MixedCaseMonkey);
DescendantsTracker.registerSubclass(Base, MixedCaseMonkey);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MixedCaseMonkey {
  get human(): Human | null | Promise<Human | null>;
  set human(value: Human | null);
}
