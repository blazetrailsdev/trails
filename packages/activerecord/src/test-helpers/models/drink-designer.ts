import { registerConstant } from "@blazetrails/ruby-compat";
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
registerConstant("DrinkDesigner", DrinkDesigner);
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
registerConstant(
  "DrinkDesignerWithPolymorphicDependentNullifyChef",
  DrinkDesignerWithPolymorphicDependentNullifyChef,
);
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
registerConstant("DrinkDesignerWithPolymorphicTouchChef", DrinkDesignerWithPolymorphicTouchChef);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DrinkDesignerWithPolymorphicTouchChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

export class MocktailDesigner extends DrinkDesigner {}
registerConstant("MocktailDesigner", MocktailDesigner);
