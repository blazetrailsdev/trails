import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Recipe } from "./recipe.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Chef extends Base {
  declare recipes: AssociationProxy<Recipe>;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare department_id: number;
  declare employable_id: number;
  declare employable_list_id: number;
  declare employable_list_type: string;
  declare employable_type: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.belongsTo("employable", { polymorphic: true });
    this.hasMany("recipes");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Chef {
  get employable(): Base | null | Promise<Base | null>;
  set employable(value: Base | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ChefList extends Chef {
  static {
    this.belongsTo("employableList", { polymorphic: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ChefList {
  get employableList(): Base | null | Promise<Base | null>;
  set employableList(value: Base | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ChefWithPolymorphicInverseOf extends Chef {
  beforeValidationCallbacksCounter: number = 0;
  beforeCreateCallbacksCounter: number = 0;
  beforeSaveCallbacksCounter: number = 0;
  afterValidationCallbacksCounter: number = 0;
  afterCreateCallbacksCounter: number = 0;
  afterSaveCallbacksCounter: number = 0;

  static {
    this.belongsTo("employable", { polymorphic: true, inverseOf: "chef" });
    this.acceptsNestedAttributesFor("employable");

    this.beforeValidation(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeValidationCallbacksCounter++;
    });
    this.beforeCreate(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeCreateCallbacksCounter++;
    });
    this.beforeSave(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeSaveCallbacksCounter++;
    });
    this.afterValidation(function (this: ChefWithPolymorphicInverseOf) {
      this.afterValidationCallbacksCounter++;
    });
    this.afterCreate(function (this: ChefWithPolymorphicInverseOf) {
      this.afterCreateCallbacksCounter++;
    });
    this.afterSave(function (this: ChefWithPolymorphicInverseOf) {
      this.afterSaveCallbacksCounter++;
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ChefWithPolymorphicInverseOf {
  get employable(): Base | null | Promise<Base | null>;
  set employable(value: Base | null);
}
