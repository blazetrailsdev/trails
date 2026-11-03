import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Mouse } from "./mouse.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Squeak extends Base {
  declare mouse_id: number;

  static {
    this.belongsTo("mouse");
    this.acceptsNestedAttributesFor("mouse");
  }
}
constSet(TopLevel, "Squeak", Squeak);
DescendantsTracker.registerSubclass(Base, Squeak);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Squeak {
  get mouse(): Mouse | null | Promise<Mouse | null>;
  set mouse(value: Mouse | null);
}
