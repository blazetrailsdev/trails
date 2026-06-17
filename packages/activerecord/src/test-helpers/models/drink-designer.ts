import type { Chef } from "./chef.js";
// vendor/rails/activerecord/test/models/drink_designer.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class DrinkDesigner extends Base {
  declare chef: Chef | null;
  declare loadHasOne: (name: "chef") => Promise<Chef | null>;
  declare name: string;

  static {
    this.hasOne("chef", { as: "employable" });
  }
}

acceptsNestedAttributesFor(DrinkDesigner, "chef");

export class DrinkDesignerWithPolymorphicDependentNullifyChef extends Base {
  declare chef: Chef | null;
  declare loadHasOne: (name: "chef") => Promise<Chef | null>;

  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", dependent: "nullify" });
  }
}

export class DrinkDesignerWithPolymorphicTouchChef extends Base {
  declare chef: Chef | null;
  declare loadHasOne: (name: "chef") => Promise<Chef | null>;

  static {
    this.tableName = "drink_designers";

    this.hasOne("chef", { as: "employable", touch: true });
  }
}

export class MocktailDesigner extends DrinkDesigner {}
