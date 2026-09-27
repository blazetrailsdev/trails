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
  declare beforeValidationCallbacksCounter: number;
  declare beforeCreateCallbacksCounter: number;
  declare beforeSaveCallbacksCounter: number;
  declare afterValidationCallbacksCounter: number;
  declare afterCreateCallbacksCounter: number;
  declare afterSaveCallbacksCounter: number;

  static {
    this.belongsTo("employable", { polymorphic: true, inverseOf: "chef" });
    this.acceptsNestedAttributesFor("employable");

    this.beforeValidation(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeValidationCallbacksCounter ??= 0;
      this.beforeValidationCallbacksCounter += 1;
    });
    this.beforeCreate(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeCreateCallbacksCounter ??= 0;
      this.beforeCreateCallbacksCounter += 1;
    });
    this.beforeSave(function (this: ChefWithPolymorphicInverseOf) {
      this.beforeSaveCallbacksCounter ??= 0;
      this.beforeSaveCallbacksCounter += 1;
    });
    this.afterValidation(function (this: ChefWithPolymorphicInverseOf) {
      this.afterValidationCallbacksCounter ??= 0;
      this.afterValidationCallbacksCounter += 1;
    });
    this.afterCreate(function (this: ChefWithPolymorphicInverseOf) {
      this.afterCreateCallbacksCounter ??= 0;
      this.afterCreateCallbacksCounter += 1;
    });
    this.afterSave(function (this: ChefWithPolymorphicInverseOf) {
      this.afterSaveCallbacksCounter ??= 0;
      this.afterSaveCallbacksCounter += 1;
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ChefWithPolymorphicInverseOf {
  get employable(): Base | null | Promise<Base | null>;
  set employable(value: Base | null);
}
