import { ActiveStorage } from "./active-storage.js";
import type { Changes } from "./attached/changes.js";
import type { CreateMany } from "./attached/changes/create-many.js";
import type { CreateOne } from "./attached/changes/create-one.js";
import type { DeleteMany } from "./attached/changes/delete-many.js";
import type { DeleteOne } from "./attached/changes/delete-one.js";
import type { Many } from "./attached/many.js";
import type { Model } from "./attached/model.js";
import type { One } from "./attached/one.js";
import type { Base } from "@blazetrails/activerecord";

export type AttachedRecord = Base & {
  attachmentChanges: { [k: string]: CreateOne | DeleteOne | CreateMany | DeleteMany | undefined };
  attachmentReflections: { [k: string]: { options: { [k: string]: unknown } } };
};

export type AssociationWriter = { writer(value: unknown): unknown };

export class Attached {
  declare static Model: typeof Model;
  declare static One: typeof One;
  declare static Many: typeof Many;
  declare static Changes: typeof Changes;

  readonly name: string;
  readonly record: AttachedRecord;

  constructor(name: string, record: AttachedRecord) {
    this.name = name;
    this.record = record;
  }

  /** @internal */
  protected get change(): CreateOne | DeleteOne | CreateMany | DeleteMany | undefined {
    return this.record.attachmentChanges[this.name];
  }
}

ActiveStorage.Attached = Attached;
