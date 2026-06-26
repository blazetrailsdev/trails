import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Recipe } from "./recipe.js";
// vendor/rails/activerecord/test/models/chef.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Chef extends Base {
  declare employable: Base | null;
  declare recipes: AssociationProxy<Recipe>;
  declare loadBelongsTo: (name: "employable") => Promise<Base | null>;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare department_id: number;
  declare employable_id: number;
  declare employable_list_id: number;
  declare employable_list_type: string;
  declare employable_type: string;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.belongsTo("employable", { polymorphic: true });
    this.hasMany("recipes");
  }
}

export class ChefList extends Chef {
  declare employableList: Base | null;
  declare loadBelongsTo: ((name: "employable") => Promise<Base | null>) &
    ((name: "employableList") => Promise<Base | null>);

  static {
    this.belongsTo("employableList", { polymorphic: true });
  }
}

export class ChefWithPolymorphicInverseOf extends Chef {
  declare employable: Base | null;
  declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

  beforeValidationCallbacksCounter: number = 0;
  beforeCreateCallbacksCounter: number = 0;
  beforeSaveCallbacksCounter: number = 0;
  afterValidationCallbacksCounter: number = 0;
  afterCreateCallbacksCounter: number = 0;
  afterSaveCallbacksCounter: number = 0;

  static {
    this.belongsTo("employable", { polymorphic: true, inverseOf: "chef" });

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

acceptsNestedAttributesFor(ChefWithPolymorphicInverseOf, "employable");
