import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Notification extends Base {
  declare message: string;

  static {
    this.validates("message", { presence: true });
  }
}
constSet(TopLevel, "Notification", Notification);
DescendantsTracker.registerSubclass(Base, Notification);
