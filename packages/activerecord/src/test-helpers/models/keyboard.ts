import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static {
    this.primaryKey = "key_number";
  }
}
constSet(TopLevel, "Keyboard", Keyboard);
DescendantsTracker.registerSubclass(Base, Keyboard);
