// vendor/rails/activerecord/test/models/eye.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Eye extends Base {
  declare iris: Iris | null;
  declare irisWithReadOnlyForeignKey: IrisWithReadOnlyForeignKey | null;
  declare loadHasOne: ((name: "iris") => Promise<Iris | null>) &
    ((name: "irisWithReadOnlyForeignKey") => Promise<IrisWithReadOnlyForeignKey | null>);

  afterCreateCallbacksStack: boolean[] = [];
  afterUpdateCallbacksStack: boolean[] = [];
  afterSaveCallbacksStack: boolean[] = [];
  overrideIrisWithReadOnlyForeignKeyColor: boolean = false;

  /**
   * Rails reads `iris` directly in these callbacks. The trails has_one reader
   * is async, so a callback running while the association is unloaded would see
   * a thenable rather than a record; read the loaded target instead (an
   * unloaded has_one on a just-created owner has no persisted row anyway).
   */
  private get irisTarget(): Iris | null {
    const assoc = this.association("iris");
    return assoc.isLoaded() ? (assoc.target as Iris | null) : null;
  }

  static {
    this.afterCreate(function (this: Eye) {
      if (this.irisTarget) this.afterCreateCallbacksStack.push(!this.irisTarget.isPersisted());
    });
    this.afterUpdate(function (this: Eye) {
      if (this.irisTarget) this.afterUpdateCallbacksStack.push(this.irisTarget.hasChangesToSave);
    });
    this.afterSave(function (this: Eye) {
      if (this.irisTarget) this.afterSaveCallbacksStack.push(this.irisTarget.hasChangesToSave);
    });

    this.hasOne("iris");

    this.afterCreate(function (this: Eye) {
      if (this.irisTarget) this.afterCreateCallbacksStack.push(!this.irisTarget.isPersisted());
    });
    this.afterUpdate(function (this: Eye) {
      if (this.irisTarget) this.afterUpdateCallbacksStack.push(this.irisTarget.hasChangesToSave);
    });
    this.afterSave(function (this: Eye) {
      if (this.irisTarget) this.afterSaveCallbacksStack.push(this.irisTarget.hasChangesToSave);
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
  declare eye: Eye | null;
  declare loadBelongsTo: (name: "eye") => Promise<Eye | null>;
  declare color: string;
  declare eye_id: number;

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
  declare loadBelongsTo: (name: "eye") => Promise<Eye | null>;

  static {
    this.attrReadonly("eye_id");
  }
}
