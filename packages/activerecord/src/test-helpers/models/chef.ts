// vendor/rails/activerecord/test/models/chef.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Chef extends Base {
  static {
    this.belongsTo("employable", { polymorphic: true });
    this.hasMany("recipes");
  }
}

export class ChefList extends Chef {
  static {
    this.belongsTo("employableList", { polymorphic: true });
  }
}

export class ChefWithPolymorphicInverseOf extends Chef {
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
