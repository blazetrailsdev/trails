import type { Base } from "./base.js";
import { include, included } from "@blazetrails/activesupport";
import { ValidationsCallbacks } from "@blazetrails/activemodel";
import { runCallbacks } from "@blazetrails/activesupport";
import { _createRecord as counterCacheCreateRecord } from "./counter-cache.js";
import { _createRecord as encryptableRecordCreateRecord } from "./encryption/encryptable-record.js";
import { recordUpdateTimestamps } from "./timestamp.js";
import {
  _createRecord as persistenceCreateRecord,
  InstanceMethods as PersistenceInstanceMethods,
} from "./persistence.js";
import {
  _createRecord as dirtyCreateRecord,
  _updateRecord as dirtyUpdateRecord,
} from "./attribute-methods/dirty.js";

type ModelCtor = typeof Base;

export const InstanceMethods = {
  [included](base: ModelCtor): void {
    include(base, ValidationsCallbacks);

    base.defineModelCallbacks("initialize", "find", "touch", { only: "after" });
    base.defineModelCallbacks("save", "create", "update", "destroy");
  },
};

/** @internal */
export function createOrUpdate(this: any, block?: (record: any) => void): Promise<boolean> {
  return (this._createOrUpdate as (block?: (record: any) => void) => Promise<boolean>).call(
    this,
    block,
  );
}

export function touch(
  this: any,
  args: unknown[],
  superFn: () => Promise<boolean>,
): Promise<boolean> {
  return runCallbacks(this, "touch", superFn) as Promise<boolean>;
}

/** @internal */
export async function _createRecord(
  this: any,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<unknown> {
  const ctor = this.constructor;
  return await runCallbacks(this, "create", () =>
    dirtyCreateRecord.call(this, attributeNames, (names: string[]) =>
      encryptableRecordCreateRecord.call(this, names, (encryptedNames: string[]) =>
        counterCacheCreateRecord.call(this, encryptedNames, (names2: string[]) =>
          persistenceCreateRecord.call(this, names2, block),
        ),
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
  return await runCallbacks(this, "update", () =>
    recordUpdateTimestamps.call(this, () =>
      dirtyUpdateRecord.call(this, attributeNames, (names: string[]) =>
        PersistenceInstanceMethods._updateRecord.call(this, names, block),
      ),
    ),
  );
}
