import type { Chef } from "./chef.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DrinkDesigner extends Base {
  declare name: string;

  static {
    this.hasOne("chef", { as: "employable" });
    this.acceptsNestedAttributesFor("chef");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DrinkDesigner {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DrinkDesignerWithPolymorphicDependentNullifyChef extends Base {
  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", dependent: "nullify" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DrinkDesignerWithPolymorphicDependentNullifyChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DrinkDesignerWithPolymorphicTouchChef extends Base {
  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", touch: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DrinkDesignerWithPolymorphicTouchChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

export class MocktailDesigner extends DrinkDesigner {}
