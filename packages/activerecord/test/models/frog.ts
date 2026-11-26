import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Frog extends Base {
  declare name: string;

  static {
    this.afterSave(async (frog: Frog) => {
      await frog.withLock(async () => {});
    });
  }
}
constSet(TopLevel, "Frog", Frog);
DescendantsTracker.registerSubclass(Base, Frog);
