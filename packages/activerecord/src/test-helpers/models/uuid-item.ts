import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

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
