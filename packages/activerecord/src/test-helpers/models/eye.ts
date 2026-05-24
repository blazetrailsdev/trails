// vendor/rails/activerecord/test/models/eye.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Eye extends Base {
  afterCreateCallbacksStack: boolean[] = [];
  afterUpdateCallbacksStack: boolean[] = [];
  afterSaveCallbacksStack: boolean[] = [];
  overrideIrisWithReadOnlyForeignKeyColor: boolean = false;

  static {
    this.afterCreate(function (this: Eye) {
      if ((this as any).iris)
        this.afterCreateCallbacksStack.push(!(this as any).iris.isPersisted());
    });
    this.afterUpdate(function (this: Eye) {
      if ((this as any).iris)
        this.afterUpdateCallbacksStack.push((this as any).iris.hasChangesToSave());
    });
    this.afterSave(function (this: Eye) {
      if ((this as any).iris)
        this.afterSaveCallbacksStack.push((this as any).iris.hasChangesToSave());
    });

    this.hasOne("iris");

    this.afterCreate(function (this: Eye) {
      if ((this as any).iris)
        this.afterCreateCallbacksStack.push(!(this as any).iris.isPersisted());
    });
    this.afterUpdate(function (this: Eye) {
      if ((this as any).iris)
        this.afterUpdateCallbacksStack.push((this as any).iris.hasChangesToSave());
    });
    this.afterSave(function (this: Eye) {
      if ((this as any).iris)
        this.afterSaveCallbacksStack.push((this as any).iris.hasChangesToSave());
    });

    this.hasOne("irisWithReadOnlyForeignKey", {
      className: "IrisWithReadOnlyForeignKey",
      foreignKey: "eye_id",
    });

    this.beforeSave(function (this: Eye) {
      if (
        (this as any).irisWithReadOnlyForeignKey &&
        this.overrideIrisWithReadOnlyForeignKeyColor
      ) {
        (this as any).irisWithReadOnlyForeignKey.color = "blue";
      }
    });
  }
}

acceptsNestedAttributesFor(Eye, "iris");
acceptsNestedAttributesFor(Eye, "irisWithReadOnlyForeignKey");

export class Iris extends Base {
  beforeValidationCallbacksCounter: number = 0;
  beforeCreateCallbacksCounter: number = 0;
  beforeSaveCallbacksCounter: number = 0;
  afterValidationCallbacksCounter: number = 0;
  afterCreateCallbacksCounter: number = 0;
  afterSaveCallbacksCounter: number = 0;

  static {
    this.belongsTo("eye");

    this.beforeValidation(function (this: Iris) {
      this.beforeValidationCallbacksCounter++;
    });
    this.beforeCreate(function (this: Iris) {
      this.beforeCreateCallbacksCounter++;
    });
    this.beforeSave(function (this: Iris) {
      this.beforeSaveCallbacksCounter++;
    });
    this.afterValidation(function (this: Iris) {
      this.afterValidationCallbacksCounter++;
    });
    this.afterCreate(function (this: Iris) {
      this.afterCreateCallbacksCounter++;
    });
    this.afterSave(function (this: Iris) {
      this.afterSaveCallbacksCounter++;
    });
  }
}

export class IrisWithReadOnlyForeignKey extends Iris {
  static {
    this.attrReadonly("eye_id");
  }
}
