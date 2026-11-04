import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
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
constSet(TopLevel, "DrinkDesigner", DrinkDesigner);
DescendantsTracker.registerSubclass(Base, DrinkDesigner);
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
constSet(
  TopLevel,
  "DrinkDesignerWithPolymorphicDependentNullifyChef",
  DrinkDesignerWithPolymorphicDependentNullifyChef,
);
DescendantsTracker.registerSubclass(Base, DrinkDesignerWithPolymorphicDependentNullifyChef);
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
constSet(TopLevel, "DrinkDesignerWithPolymorphicTouchChef", DrinkDesignerWithPolymorphicTouchChef);
DescendantsTracker.registerSubclass(Base, DrinkDesignerWithPolymorphicTouchChef);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DrinkDesignerWithPolymorphicTouchChef {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}

export class MocktailDesigner extends DrinkDesigner {}
constSet(TopLevel, "MocktailDesigner", MocktailDesigner);
DescendantsTracker.registerSubclass(DrinkDesigner, MocktailDesigner);
