import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static {
    this.primaryKey = "id";
  }
}
constSet(TopLevel, "StringKeyObject", StringKeyObject);
DescendantsTracker.registerSubclass(Base, StringKeyObject);
