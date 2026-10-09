import type { Base } from "./base.js";
import type { CallbackConditions, CallbackObject } from "@blazetrails/activemodel";
import { RecordNotDestroyed } from "./errors.js";
import { include, included } from "@blazetrails/activesupport";
import { ValidationsCallbacks } from "@blazetrails/activemodel";
import { rtest } from "@blazetrails/ruby-compat";
import { _createRecord as counterCacheCreateRecord } from "./counter-cache.js";
import { _createRecord as lockingCreateRecord } from "./locking/optimistic.js";
import { _createRecord as encryptableRecordCreateRecord } from "./encryption/encryptable-record.js";
import { recordUpdateTimestamps } from "./timestamp.js";
import { _createRecord as persistenceCreateRecord, Persistence } from "./persistence.js";
import {
  _createRecord as dirtyCreateRecord,
  _updateRecord as dirtyUpdateRecord,
} from "./attribute-methods/dirty.js";

type ModelCtor = typeof Base;

export const Callbacks = {
  [included](base: ModelCtor): void {
    include(base, ValidationsCallbacks);

    base.defineModelCallbacks("initialize", "find", "touch", { only: "after" });
    base.defineModelCallbacks("save", "create", "update", "destroy");
  },
};

export declare class ClassMethods {
  afterInitialize: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterFind: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterTouch: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  beforeSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  aroundSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterSave: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  beforeCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  aroundCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterCreate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  beforeUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  aroundUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterUpdate: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  beforeDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  aroundDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>, proceed: () => void | Promise<void>) => void | Promise<void>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;

  afterDestroy: <T extends typeof Base>(
    this: T,
    fn:
      | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
      | CallbackObject
      | string,
    conditions?: CallbackConditions<InstanceType<T>>,
  ) => void;
}

export async function destroy<T>(this: any, superFn: () => Promise<T>): Promise<T | boolean> {
  this._destroyCallbackAlreadyCalled ||= false;
  if (this._destroyCallbackAlreadyCalled) return true;
  this._destroyCallbackAlreadyCalled = true;
  try {
    return (await this.runCallbacks("destroy", superFn)) as T | boolean;
  } catch (e) {
    if (!(e instanceof RecordNotDestroyed)) throw e;
    this._associationDestroyException = e;
    return false;
  } finally {
    this._destroyCallbackAlreadyCalled = false;
  }
}

export function touch(
  this: any,
  args: unknown[],
  superFn: () => Promise<boolean>,
): Promise<boolean> {
  return this.runCallbacks("touch", superFn) as Promise<boolean>;
}

export function incrementBang<T>(
  this: any,
  super_: (...args: unknown[]) => Promise<T>,
  attribute: string,
  by: number = 1,
  options: { touch?: unknown } = {},
): Promise<T> {
  return rtest(options.touch)
    ? (this.runCallbacks("touch", () => super_(attribute, by, options)) as Promise<T>)
    : super_(attribute, by, options);
}

/** @internal */
export function createOrUpdate(this: any, superFn: () => Promise<boolean>): Promise<boolean> {
  return this.runCallbacks("save", superFn) as Promise<boolean>;
}

/** @internal */
export async function _createRecord(
  this: any,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<unknown> {
  const ctor = this.constructor;
  return await this.runCallbacks("create", () =>
    dirtyCreateRecord.call(this, attributeNames, (names: string[]) =>
      encryptableRecordCreateRecord.call(
        this,
        names,
        (encryptedNames: string[]) =>
          lockingCreateRecord.call(this, encryptedNames, (lockedNames: string[]) =>
            counterCacheCreateRecord.call(this, lockedNames, (names2: string[]) =>
              persistenceCreateRecord.call(this, names2, block),
            ),
          ) as Promise<unknown>,
      ),
    ),
  );
}

/** @internal */
export async function _updateRecord(
  this: any,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<unknown> {
  return await this.runCallbacks("update", () =>
    recordUpdateTimestamps.call(this, () =>
      dirtyUpdateRecord.call(this, attributeNames, (names: string[]) =>
        Persistence.instanceMethod("_updateRecord")!.value.call(this, names, block),
      ),
    ),
  );
}
