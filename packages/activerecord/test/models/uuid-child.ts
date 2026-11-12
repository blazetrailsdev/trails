import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { UuidParent } from "./uuid-parent.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidChild extends Base {
  static {
    this.belongsTo("uuidParent");
  }
}
constSet(TopLevel, "UuidChild", UuidChild);
DescendantsTracker.registerSubclass(Base, UuidChild);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidChild {
  get uuidParent(): UuidParent | null | Promise<UuidParent | null>;
  set uuidParent(value: UuidParent | null);
}
