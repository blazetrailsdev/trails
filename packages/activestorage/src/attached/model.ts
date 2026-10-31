import { Reflection, type Base, type Relation } from "@blazetrails/activerecord";
import {
  camelize,
  compactBlank,
  Concern,
  extend,
  TopLevel,
  tryCall,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  block,
  hashDelete,
  rbFArray,
  rbCallSuper,
  rbInspect,
  rbModName,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Attached, type AttachedRecord } from "../attached.js";
import { Blob } from "../blob.js";
import { CreateMany } from "./changes/create-many.js";
import type { CreateOneOfMany } from "./changes/create-one-of-many.js";
import { CreateOne } from "./changes/create-one.js";
import { DeleteMany } from "./changes/delete-many.js";
import { DeleteOne } from "./changes/delete-one.js";
import { Many } from "./many.js";
import { One } from "./one.js";
import type { HasManyAttachedReflection, HasOneAttachedReflection } from "../reflection.js";
import { ReflectionExtension } from "../reflection.js";

interface ModelHost {
  _activeStorageAttached?: { [k: string]: One | Many } | null;
  _attachmentChanges?: AttachedRecord["attachmentChanges"] | null;
}

type HasAttachedOptions = {
  dependent?: string | false;
  service?: string | ((record: AttachedRecord) => string) | null;
  strictLoading?: boolean;
};

function hasOneAttached(
  this: typeof Base,
  name: string,
  { dependent = "purge_later", service = null, strictLoading = false }: HasAttachedOptions = {},
  blk?: (attachable: HasOneAttachedReflection) => void,
): void {
  if (typeof service !== "function") Model.validateServiceConfiguration(service, this, name);

  const mixin = this.generatedAssociationMethods();
  mixin.moduleEval((m) => {
    Object.defineProperty(m, name, {
      get(this: ModelHost & AttachedRecord) {
        this._activeStorageAttached ??= {};
        return (this._activeStorageAttached[name] ??= new One(name, this));
      },
      configurable: true,
      enumerable: true,
    });
  });
  mixin.defineMethod(`set${camelize(name)}`, async function (
    this: AttachedRecord,
    attachable: unknown,
  ) {
    if (attachable == null || attachable === "") {
      this.attachmentChanges[name] = new DeleteOne(name, this);
    } else {
      const change = new CreateOne(name, this, attachable);
      await change.unfurl();
      this.attachmentChanges[name] = change;
    }
  } as never);

  this.hasOne(
    `${name}Attachment`,
    function (this: Relation<Base>) {
      return this.where({ name: name });
    },
    {
      className: "ActiveStorage::Attachment",
      as: "record",
      inverseOf: "record",
      dependent: "destroy",
      strictLoading: strictLoading,
    },
  );
  this.hasOne(`${name}Blob`, {
    through: `${name}Attachment`,
    className: "ActiveStorage::Blob",
    source: "blob",
    strictLoading: strictLoading,
  });

  this.scope(`withAttached${camelize(name)}`, function (this: Relation<Base>) {
    if (ActiveStorage.trackVariants) {
      return this.includes({
        [`${name}Attachment`]: {
          blob: {
            variantRecords: { imageAttachment: "blob" },
            previewImageAttachment: { blob: { variantRecords: { imageAttachment: "blob" } } },
          },
        },
      });
    } else {
      return this.includes({ [`${name}Attachment`]: "blob" });
    }
  });

  this.afterSave(async (record: AttachedRecord) => {
    await record.attachmentChanges[name]?.save();
  });

  this.afterCommit(
    async (record: AttachedRecord) => {
      const change = hashDelete(record.attachmentChanges, name) as CreateOne | DeleteOne | null;
      await tryCall(change, "upload");
    },
    { on: ["create", "update"] },
  );

  const reflection = Reflection.create!(
    "hasOneAttached",
    name,
    null,
    { dependent: dependent, serviceName: service },
    this,
  ) as HasOneAttachedReflection;
  if (blk) blk(reflection);
  ReflectionExtension.addAttachmentReflection(this, name, reflection);
}

function hasManyAttached(
  this: typeof Base,
  name: string,
  { dependent = "purge_later", service = null, strictLoading = false }: HasAttachedOptions = {},
  blk?: (attachable: HasManyAttachedReflection) => void,
): void {
  if (typeof service !== "function") Model.validateServiceConfiguration(service, this, name);

  const mixin = this.generatedAssociationMethods();
  mixin.moduleEval((m) => {
    Object.defineProperty(m, name, {
      get(this: ModelHost & AttachedRecord) {
        this._activeStorageAttached ??= {};
        return (this._activeStorageAttached[name] ??= new Many(name, this));
      },
      configurable: true,
      enumerable: true,
    });
  });
  mixin.defineMethod(`set${camelize(name)}`, async function (
    this: AttachedRecord,
    attachables: unknown,
  ) {
    attachables = compactBlank(rbFArray(attachables));
    const pendingUploads = tryCall(this.attachmentChanges[name], "pendingUploads") as
      | CreateOneOfMany[]
      | undefined;

    if ((attachables as unknown[]).length === 0) {
      this.attachmentChanges[name] = new DeleteMany(name, this);
    } else {
      const change = new CreateMany(name, this, attachables, { pendingUploads: pendingUploads });
      await change.unfurl();
      this.attachmentChanges[name] = change;
    }
  } as never);

  this.hasMany(
    `${name}Attachments`,
    function (this: Relation<Base>) {
      return this.where({ name: name });
    },
    {
      as: "record",
      className: "ActiveStorage::Attachment",
      inverseOf: "record",
      dependent: "destroy",
      strictLoading: strictLoading,
    },
  );
  this.hasMany(`${name}Blobs`, {
    through: `${name}Attachments`,
    className: "ActiveStorage::Blob",
    source: "blob",
    strictLoading: strictLoading,
  });

  this.scope(`withAttached${camelize(name)}`, function (this: Relation<Base>) {
    if (ActiveStorage.trackVariants) {
      return this.includes({
        [`${name}Attachments`]: {
          blob: {
            variantRecords: { imageAttachment: "blob" },
            previewImageAttachment: { blob: { variantRecords: { imageAttachment: "blob" } } },
          },
        },
      });
    } else {
      return this.includes({ [`${name}Attachments`]: "blob" });
    }
  });

  this.afterSave(async (record: AttachedRecord) => {
    await record.attachmentChanges[name]?.save();
  });

  this.afterCommit(
    async (record: AttachedRecord) => {
      const change = hashDelete(record.attachmentChanges, name) as CreateMany | DeleteMany | null;
      await tryCall(change, "upload");
    },
    { on: ["create", "update"] },
  );

  const reflection = Reflection.create!(
    "hasManyAttached",
    name,
    null,
    { dependent: dependent, serviceName: service },
    this,
  ) as HasManyAttachedReflection;
  if (blk) blk(reflection);
  ReflectionExtension.addAttachmentReflection(this, name, reflection);
}

export const ClassMethods = { hasOneAttached, hasManyAttached };

function validateServiceConfiguration(
  serviceName: string | null,
  modelClass: unknown,
  associationName: string,
): void {
  if (serviceName != null && serviceName !== (false as unknown)) {
    Blob.services.fetch(
      serviceName,
      block(() => {
        throw new ArgumentError(
          `Cannot configure service ${rbInspect(serviceName)} for ${rbModName(modelClass as object)}#${associationName}`,
        );
      }) as never,
    );
  } else {
    validateGlobalServiceConfiguration(modelClass as typeof Base);
  }
}

/**
 * @internal
 * @missingRailsCall table_exists — CONVERGEABLE activestorage-engine
 */
function validateGlobalServiceConfiguration(modelClass: typeof Base): void {
  const trails = TopLevel.Trails as unknown as
    | { configuration: { activeStorage?: { service?: unknown } }; env: unknown }
    | undefined;
  if (modelClass.isConnected() && trails!.configuration.activeStorage?.service == null) {
    throw new RuntimeError(
      `Missing Active Storage service name. Specify Active Storage service name for config.active_storage.service in config/environments/${String(trails!.env)}.rb`,
    );
  }
}

function changedForAutosave(this: Base & AttachedRecord): boolean {
  return (
    (rbCallSuper(this, changedForAutosave) as boolean) ||
    Object.keys(this.attachmentChanges).length > 0
  );
}

function initializeDup(this: Base & ModelHost, ...args: unknown[]): void {
  rbCallSuper(this, initializeDup, ...args);
  this._activeStorageAttached = null;
  this._attachmentChanges = null;
}

async function reload<T extends Base & ModelHost>(this: T, ...args: unknown[]): Promise<T> {
  const record = (await rbCallSuper(this, reload, ...args)) as T;
  this._attachmentChanges = null;
  return record;
}

export const Model = {
  get attachmentChanges() {
    const self = this as unknown as ModelHost;
    return (self._attachmentChanges ??= {});
  },
  changedForAutosave,
  initializeDup,
  reload,
} as unknown as {
  attachmentChanges: AttachedRecord["attachmentChanges"];
  changedForAutosave: typeof changedForAutosave;
  initializeDup: typeof initializeDup;
  reload: typeof reload;
  ClassMethods: typeof ClassMethods;
  validateServiceConfiguration: typeof validateServiceConfiguration;
};
extend(Model, Concern);
Object.defineProperty(Model, "validateServiceConfiguration", {
  value: validateServiceConfiguration,
  enumerable: false,
});
Model.ClassMethods = ClassMethods;

Attached.Model = Model;
