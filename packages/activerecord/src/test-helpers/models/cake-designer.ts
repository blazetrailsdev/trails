import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Chef } from "./chef.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CakeDesigner extends Base {
  static {
    this.hasOne("chef", { as: "employable" });
  }
}
constSet(TopLevel, "CakeDesigner", CakeDesigner);
DescendantsTracker.registerSubclass(Base, CakeDesigner);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CakeDesigner {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}
