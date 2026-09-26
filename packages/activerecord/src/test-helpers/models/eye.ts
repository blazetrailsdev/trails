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
  afterCreateCallbacksStack: boolean[] = [];
  afterUpdateCallbacksStack: boolean[] = [];
  afterSaveCallbacksStack: boolean[] = [];
  overrideIrisWithReadOnlyForeignKeyColor: boolean = false;

  static {
    this.afterCreate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterCreateCallbacksStack.push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterUpdateCallbacksStack.push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterSaveCallbacksStack.push(iris.hasChangesToSave);
    });

    this.hasOne("iris");
    this.acceptsNestedAttributesFor("iris");

    this.afterCreate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterCreateCallbacksStack.push(!iris.isPersisted());
    });
    this.afterUpdate(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterUpdateCallbacksStack.push(iris.hasChangesToSave);
    });
    this.afterSave(async function (this: Eye) {
      const iris = await read<Iris>(this, "iris");
      if (iris) this.afterSaveCallbacksStack.push(iris.hasChangesToSave);
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
