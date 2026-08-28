/**
 * Callback lifecycle hooks for ActiveRecord persistence operations.
 *
 * In Rails, Callbacks wraps destroy/touch/increment! to fire
 * before/after hooks. Registration and run-path call through activesupport's
 * callback engine via the helpers in @blazetrails/activemodel.
 *
 * Mirrors: ActiveRecord::Callbacks
 */

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

/**
 * Mirrors: ActiveRecord::Callbacks' `included do ... end` (callbacks.rb:412-417).
 * The two `define_model_callbacks` calls (callbacks.rb:415-416) generate
 * `after_initialize` / `after_find` / `after_touch` and `before_save` …
 * `around_destroy` on the including class
 * (activemodel/lib/active_model/callbacks.rb:109-127).
 */
export const InstanceMethods = {
  [included](base: ModelCtor): void {
    include(base, ValidationsCallbacks);

    base.defineModelCallbacks("initialize", "find", "touch", { only: "after" });
    base.defineModelCallbacks("save", "create", "update", "destroy");
  },
};

/**
 * Snapshot the `event` callbacks on `modelClass` and every subclass, run `fn`,
 * then restore them — so a callback registered inside `fn` (e.g. a temporary
 * `after_initialize` recorder) is reverted afterwards and never leaks into the
 * shared per-worker model state.
 *
 * Mirrors the `reset_callbacks(klass, kind)` test helper in
 * ActiveRecord::TestCase (vendor/rails/activerecord/test/cases/test_case.rb):
 * it captures `_<kind>_callbacks.dup` for the class and its subclasses, yields,
 * and restores them in an `ensure`.
 */
export async function resetCallbacks(
  modelClass: ModelCtor,
  event: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  // test_case.rb:180-184 — `_#{kind}_callbacks.dup` for the class and each
  // subclass. trails keys a chain on the prototype (the object its instances
  // resolve it from), and duplicates it as its entry array.
  const oldCallbacks = new Map<ModelCtor, Callback[] | undefined>();
  const targets = [modelClass, ..._subclasses(modelClass)];
  for (const klass of targets) {
    const chain = peekCallbackChain((klass as { prototype: object }).prototype, event);
    oldCallbacks.set(klass, chain ? [...chain.entries] : undefined);
  }
  try {
    await fn();
  } finally {
    // test_case.rb:187-190 — `_#{kind}_callbacks=` writes the saved chain back.
    for (const klass of targets) {
      const chains = getCallbackChains((klass as { prototype: object }).prototype);
      const chain = chains.get(event);
      if (!chain) continue;
      chain.clear();
      for (const entry of oldCallbacks.get(klass) ?? []) chain.append(entry);
    }
  }
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::Callbacks private block.
// Rails overrides persistence methods to wrap each in _run_*_callbacks { super }.
// createOrUpdate delegates to base.ts._createOrUpdate() which runs the full
// callback+persistence cycle. _createRecord/_updateRecord wrap the underlying
// persistence work directly in their respective callback chains.
// ---------------------------------------------------------------------------

/** @internal */
export function createOrUpdate(this: any, block?: (record: any) => void): Promise<boolean> {
  // Rails: Callbacks#create_or_update wraps super in _run_save_callbacks.
  // In trails, save's before/after callback chain runs inside _createOrUpdate
  // (base.ts: runBefore("save") → dispatch create/update → runAfter("save")),
  // so this wrapper just delegates and the callback ordering still matches.
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
  // Rails: _run_create_callbacks { super }, whose value is the block's return
  // (run_callbacks returns env.value). Rails coerces one level up, in
  // create_or_update: `result != false` (persistence.rb:895) — so a nil/absent
  // value is truthy and only an explicit `false` (a halted chain) is falsey.
  // Our signature is Promise<boolean>, so that predicate is applied here.
  //
  // `super` walks base.rb's include order below Callbacks (base.rb:299-316):
  // AttributeMethods::Dirty (changes_applied, dirty.rb:239-243) → CounterCache
  // (increment_counters, counter_cache.rb:200-207) → Persistence (the INSERT).
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
  // Rails: _run_update_callbacks { record_update_timestamps { super } }, whose
  // value is the block's return. As in _createRecord, Rails' `result != false`
  // (create_or_update, persistence.rb:895) is applied here to keep the
  // Promise<boolean> signature. `super` reaches AttributeMethods::Dirty
  // (dirty.rb:233-237) and then Persistence (the UPDATE).
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
