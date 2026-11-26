import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Notification extends Base {
  declare message: string;

  static {
    this.validates("message", { presence: true });
  }
}
constSet(TopLevel, "Notification", Notification);
DescendantsTracker.registerSubclass(Base, Notification);
