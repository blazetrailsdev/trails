import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

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
