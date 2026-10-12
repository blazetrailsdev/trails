import type { Mouse } from "./mouse.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Squeak extends Base {
  declare mouse_id: number;

  static {
    this.belongsTo("mouse");
    this.acceptsNestedAttributesFor("mouse");
  }
}
registerModel(Squeak);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Squeak {
  get mouse(): Mouse | null | Promise<Mouse | null>;
  set mouse(value: Mouse | null);
}
