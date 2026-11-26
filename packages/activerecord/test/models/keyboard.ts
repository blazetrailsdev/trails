import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static {
    this.primaryKey = "key_number";
  }
}
constSet(TopLevel, "Keyboard", Keyboard);
DescendantsTracker.registerSubclass(Base, Keyboard);
