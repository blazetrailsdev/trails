import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
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
