import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class UuidEntry extends Base {
  static {
    this.delegatedType("entryable", {
      types: ["UuidMessage", "UuidComment"],
      primaryKey: "uuid",
      foreignKey: "entryable_uuid",
    });
  }
}
constSet(TopLevel, "UuidEntry", UuidEntry);
DescendantsTracker.registerSubclass(Base, UuidEntry);
