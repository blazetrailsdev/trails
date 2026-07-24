// vendor/rails/activerecord/test/models/eye.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

/**
 * Rails reads `iris` through the plain association reader, which loads the
 * target on a cold cache (`Association#load_target` — `find_target?` only
 * skips the query while the owner is *building*). The trails reader returns a
 * Promise on that path, so callbacks resolve it before touching the record;
 * `after_*` callbacks are awaited by the chain, keeping the read faithful.
 */
function irisReader(eye: Eye): Promise<Iris | null> {
  return Promise.resolve(eye.association("iris").reader as Iris | null | Promise<Iris | null>);
}

export class Eye extends Base {
  declare iris: Iris | null;
  declare irisWithReadOnlyForeignKey: IrisWithReadOnlyForeignKey | null;
  declare loadHasOne: ((name: "iris") => Promise<Iris | null>) &
    ((name: "irisWithReadOnlyForeignKey") => Promise<IrisWithReadOnlyForeignKey | null>);

  afterCreateCallbacksStack: boolean[] = [];
  afterUpdateCallbacksStack: boolean[] = [];
  afterSaveCallbacksStack: boolean[] = [];
  overrideIrisWithReadOnlyForeignKeyColor: boolean = false;

  static {
    this.afterCreate(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterCreateCallbacksStack.push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterUpdateCallbacksStack.push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterSaveCallbacksStack.push(iris.hasChangesToSave);
    });

    this.hasOne("iris");

    this.afterCreate(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterCreateCallbacksStack.push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterUpdateCallbacksStack.push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await irisReader(this);
      if (iris) this.afterSaveCallbacksStack.push(iris.hasChangesToSave);
    });

    this.hasOne("irisWithReadOnlyForeignKey", {
      className: "IrisWithReadOnlyForeignKey",
      foreignKey: "eye_id",
    });

    this.beforeSave(async function (this: Eye) {
      const iris = await Promise.resolve(
        this.association("irisWithReadOnlyForeignKey").reader as
          | IrisWithReadOnlyForeignKey
          | null
          | Promise<IrisWithReadOnlyForeignKey | null>,
      );
      if (iris && this.overrideIrisWithReadOnlyForeignKeyColor) {
        iris.color = "blue";
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
