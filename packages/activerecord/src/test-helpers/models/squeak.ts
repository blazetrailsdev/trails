import type { Mouse } from "./mouse.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Squeak extends Base {
  declare mouse_id: number;

  static {
    this.belongsTo("mouse");
  }
}
export interface Squeak {
  get mouse(): Mouse | null | Promise<Mouse | null>;
  set mouse(value: Mouse | null);
}

acceptsNestedAttributesFor(Squeak, "mouse");
