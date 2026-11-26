import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class UuidItem extends Base {}
constSet(TopLevel, "UuidItem", UuidItem);
DescendantsTracker.registerSubclass(Base, UuidItem);

export class UuidValidatingItem extends UuidItem {
  static {
    this.validatesUniquenessOf("uuid");
  }
}
constSet(TopLevel, "UuidValidatingItem", UuidValidatingItem);
DescendantsTracker.registerSubclass(UuidItem, UuidValidatingItem);
