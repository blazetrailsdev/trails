import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static {
    this.primaryKey = "id";
  }
}
constSet(TopLevel, "StringKeyObject", StringKeyObject);
DescendantsTracker.registerSubclass(Base, StringKeyObject);
