import { Base } from "../../base.js";

function read<T extends Base>(eye: Eye, name: string): Promise<T | null> {
  return Promise.resolve(
    (eye.association(name) as unknown as { reader: unknown }).reader as
      | T
      | null
      | Promise<T | null>,
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Eye extends Base {
  declare afterCreateCallbacksStack: boolean[];
  declare afterUpdateCallbacksStack: boolean[];
  declare afterSaveCallbacksStack: boolean[];
  declare overrideIrisWithReadOnlyForeignKeyColor: boolean;

  static {
    this.afterCreate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterCreateCallbacksStack ??= []).push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterUpdateCallbacksStack ??= []).push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterSaveCallbacksStack ??= []).push(iris.hasChangesToSave);
    });

    this.hasOne("iris");
    this.acceptsNestedAttributesFor("iris");

    this.afterCreate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterCreateCallbacksStack ??= []).push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterUpdateCallbacksStack ??= []).push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) (this.afterSaveCallbacksStack ??= []).push(iris.hasChangesToSave);
    });

    this.hasOne("irisWithReadOnlyForeignKey", {
      className: "IrisWithReadOnlyForeignKey",
      foreignKey: "eye_id",
    });
    this.acceptsNestedAttributesFor("irisWithReadOnlyForeignKey");

    this.beforeSave(async function (this: Eye) {
      const iris = await read<IrisWithReadOnlyForeignKey>(this, "irisWithReadOnlyForeignKey");
      if (iris && this.overrideIrisWithReadOnlyForeignKeyColor) {
        iris.color = "blue";
      }
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Eye {
  get irisWithReadOnlyForeignKey():
    | IrisWithReadOnlyForeignKey
    | null
    | Promise<IrisWithReadOnlyForeignKey | null>;
  set irisWithReadOnlyForeignKey(value: IrisWithReadOnlyForeignKey | null);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Eye {
  get iris(): Iris | null | Promise<Iris | null>;
  set iris(value: Iris | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Iris extends Base {
  declare color: string;
  declare eye_id: number;

  declare beforeValidationCallbacksCounter: number;
  declare beforeCreateCallbacksCounter: number;
  declare beforeSaveCallbacksCounter: number;
  declare afterValidationCallbacksCounter: number;
  declare afterCreateCallbacksCounter: number;
  declare afterSaveCallbacksCounter: number;

  static {
    this.belongsTo("eye");

    this.beforeValidation(function (this: Iris) {
      this.beforeValidationCallbacksCounter ??= 0;
      this.beforeValidationCallbacksCounter += 1;
    });
    this.beforeCreate(function (this: Iris) {
      this.beforeCreateCallbacksCounter ??= 0;
      this.beforeCreateCallbacksCounter += 1;
    });
    this.beforeSave(function (this: Iris) {
      this.beforeSaveCallbacksCounter ??= 0;
      this.beforeSaveCallbacksCounter += 1;
    });
    this.afterValidation(function (this: Iris) {
      this.afterValidationCallbacksCounter ??= 0;
      this.afterValidationCallbacksCounter += 1;
    });
    this.afterCreate(function (this: Iris) {
      this.afterCreateCallbacksCounter ??= 0;
      this.afterCreateCallbacksCounter += 1;
    });
    this.afterSave(function (this: Iris) {
      this.afterSaveCallbacksCounter ??= 0;
      this.afterSaveCallbacksCounter += 1;
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Iris {
  get eye(): Eye | null | Promise<Eye | null>;
  set eye(value: Eye | null);
}

export class IrisWithReadOnlyForeignKey extends Iris {
  static {
    this.attrReadonly("eye_id");
  }
}
