import type { Chef } from "./chef.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class DrinkDesigner extends Base {
  declare name: string;

  static {
    this.hasOne("chef", { as: "employable" });
  }
}
export interface DrinkDesigner {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

acceptsNestedAttributesFor(DrinkDesigner, "chef");

export class DrinkDesignerWithPolymorphicDependentNullifyChef extends Base {
  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", dependent: "nullify" });
  }
}
export interface DrinkDesignerWithPolymorphicDependentNullifyChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

export class DrinkDesignerWithPolymorphicTouchChef extends Base {
  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", touch: true });
  }
}
export interface DrinkDesignerWithPolymorphicTouchChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

export class MocktailDesigner extends DrinkDesigner {}
