import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Event extends Base {
  declare title: string | null;

  static {
    this.validates("title", { uniqueness: true });
  }
}
constSet(TopLevel, "Event", Event);
DescendantsTracker.registerSubclass(Base, Event);
