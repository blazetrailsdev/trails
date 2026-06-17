import type { Mouse } from "./mouse.js";
// vendor/rails/activerecord/test/models/squeak.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Squeak extends Base {
  declare mouse: Mouse | null;
  declare loadBelongsTo: (name: "mouse") => Promise<Mouse | null>;
  declare mouse_id: number;

  static {
    this.belongsTo("mouse");
  }
}

acceptsNestedAttributesFor(Squeak, "mouse");
