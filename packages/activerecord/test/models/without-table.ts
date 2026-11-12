import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class WithoutTable extends Base {
  static {
    this.defaultScope(function () {
      return this.where({ published: true });
    });
  }
}
constSet(TopLevel, "WithoutTable", WithoutTable);
DescendantsTracker.registerSubclass(Base, WithoutTable);
