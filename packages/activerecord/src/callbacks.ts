import type { Base } from "./base.js";
import { include, included, type Callback } from "@blazetrails/activesupport";
import { ValidationsCallbacks } from "@blazetrails/activemodel";
import { getCallbackChains, peekCallbackChain, runCallbacks } from "@blazetrails/activesupport";
import { subclasses as _subclasses } from "./inheritance.js";
import { _createRecord as counterCacheCreateRecord } from "./counter-cache.js";
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

export async function resetCallbacks(
  modelClass: ModelCtor,
  event: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  const oldCallbacks = new Map<ModelCtor, Callback[] | undefined>();
  const targets = [modelClass, ..._subclasses(modelClass)];
  for (const klass of targets) {
    const chain = peekCallbackChain((klass as { prototype: object }).prototype, event);
    oldCallbacks.set(klass, chain ? [...chain.entries] : undefined);
  }
  try {
    await fn();
  } finally {
    for (const klass of targets) {
      const chains = getCallbackChains((klass as { prototype: object }).prototype);
      const chain = chains.get(event);
      if (!chain) continue;
      chain.clear();
      for (const entry of oldCallbacks.get(klass) ?? []) chain.append(entry);
    }
  }
}

/** @internal */
export function createOrUpdate(this: any, block?: (record: any) => void): Promise<boolean> {
  return (this._createOrUpdate as (block?: (record: any) => void) => Promise<boolean>).call(
    this,
    block,
  );
}

/** @internal */
export async function _createRecord(
  this: any,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<boolean> {
  const ctor = this.constructor;
  return (
    (await runCallbacks(this, "create", () =>
      dirtyCreateRecord.call(this, () =>
        counterCacheCreateRecord.call(this, () =>
          persistenceCreateRecord.call(this, attributeNames, block),
        ),
      ),
    )) !== false
  );
}

/** @internal */
export async function _updateRecord(this: any, block?: (record: any) => void): Promise<boolean> {
  const ctor = this.constructor;
  return (
    (await runCallbacks(this, "update", () =>
      recordUpdateTimestamps.call(this, () =>
        dirtyUpdateRecord.call(this, () =>
          PersistenceInstanceMethods._updateRecord.call(this, block),
        ),
      ),
    )) !== false
  );
}
