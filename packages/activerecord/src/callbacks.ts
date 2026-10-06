import type { Base } from "./base.js";
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

/** @internal */
export function createOrUpdate(this: any, superFn: () => Promise<boolean>): Promise<boolean> {
  return this.runCallbacks("save", superFn) as Promise<boolean>;
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
        Persistence._updateRecord.call(this, names, block),
      ),
    ),
  );
}
