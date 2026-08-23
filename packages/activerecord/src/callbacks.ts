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
import { included } from "@blazetrails/activesupport";
import {
  _registerCallbackOnProto,
  runAllCallbacks,
  snapshotCallbacksOnProto,
  restoreCallbacksOnProto,
} from "@blazetrails/activemodel";
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

export type CallbackOptions<TRecord = Base> = {
  if?: (record: TRecord) => boolean;
  unless?: (record: TRecord) => boolean;
  prepend?: boolean;
};

/**
 * A callback filter: a block, or — as Rails' macros take a Symbol — the NAME
 * of a method on the record, resolved against it at invocation time
 * (ActiveSupport::Callbacks::CallTemplate::MethodCall).
 */
export type CallbackFilter<TRecord, TReturn = void | Promise<void>> =
  | ((record: TRecord) => TReturn)
  | string;

export type ValidationCallbackOptions<TRecord = Base> = CallbackOptions<TRecord> & {
  on?: "create" | "update" | Array<"create" | "update">;
};

/**
 * Register a before_validation callback.
 *
 * Mirrors: ActiveRecord::Callbacks.before_validation
 */
export function beforeValidation<T extends ModelCtor>(
  modelClass: T,
  fn: CallbackFilter<InstanceType<T>>,
  options?: ValidationCallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "before", "validation", fn, options);
}

/**
 * Register an after_validation callback.
 *
 * Mirrors: ActiveRecord::Callbacks.after_validation
 */
export function afterValidation<T extends ModelCtor>(
  modelClass: T,
  fn: CallbackFilter<InstanceType<T>>,
  options?: ValidationCallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "validation", fn, options);
}

/**
 * Mirrors: ActiveRecord::Callbacks' `included do ... end` (callbacks.rb:412-417).
 * `define_model_callbacks :save, :create, :update, :destroy` (callbacks.rb:416)
 * generates `before_save` … `around_destroy` on the including class
 * (activemodel/lib/active_model/callbacks.rb:109-127); the `:initialize`,
 * `:find` and `:touch` events of callbacks.rb:415 are still hand-written on
 * `Model`.
 */
export const InstanceMethods = {
  [included](base: ModelCtor): void {
    base.defineModelCallbacks("save", "create", "update", "destroy");
  },
};

/** @internal */
type SyncOnly<R> = R extends PromiseLike<unknown> ? never : R;

/**
 * Register an after_find callback. Fires on every record loaded from the DB.
 *
 * Rails defines :find with only: :after, so there is no before_find or around_find.
 *
 * Mirrors: ActiveRecord::Callbacks.after_find
 */
export function afterFind<T extends ModelCtor, R>(
  modelClass: T,
  fn: (record: InstanceType<T>) => SyncOnly<R>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "find", fn, options);
}

/**
 * Register an after_initialize callback. Fires on every new or loaded record.
 *
 * Rails defines :initialize with only: :after, so there is no before_initialize or around_initialize.
 *
 * Mirrors: ActiveRecord::Callbacks.after_initialize
 */
export function afterInitialize<T extends ModelCtor, R>(
  modelClass: T,
  fn: (record: InstanceType<T>) => SyncOnly<R>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "initialize", fn, options);
}

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
  const targets = [modelClass, ..._subclasses(modelClass)];
  const snapshots = targets.map(
    (klass) =>
      [klass, snapshotCallbacksOnProto((klass as { prototype: object }).prototype, event)] as const,
  );
  try {
    await fn();
  } finally {
    for (const [klass, snapshot] of snapshots) {
      restoreCallbacksOnProto((klass as { prototype: object }).prototype, event, snapshot);
    }
  }
}

type AnyCallbackOptions = CallbackOptions<never> | ValidationCallbackOptions<never>;

function registerCallback(
  modelClass: ModelCtor,
  timing: "before" | "after",
  event: string,
  fn: ((...args: any[]) => unknown) | string,
  options?: AnyCallbackOptions,
): void {
  const conditions: Record<string, unknown> = {};
  if (options?.if) conditions.if = options.if;
  if (options?.unless) conditions.unless = options.unless;
  if (options?.prepend) conditions.prepend = options.prepend;
  if (event === "validation" && "on" in (options ?? {})) {
    conditions.on = (options as ValidationCallbackOptions<never>).on;
  }
  _registerCallbackOnProto(
    (modelClass as unknown as { prototype: object }).prototype,
    timing,
    event,
    fn,
    conditions,
  );
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
export async function _createRecord(this: any, block?: (record: any) => void): Promise<boolean> {
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
    (await runAllCallbacks(ctor.prototype, "create", this, () =>
      dirtyCreateRecord.call(this, () =>
        counterCacheCreateRecord.call(this, () => persistenceCreateRecord.call(this, block)),
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
    (await runAllCallbacks(ctor.prototype, "update", this, () =>
      recordUpdateTimestamps.call(this, () =>
        dirtyUpdateRecord.call(this, () =>
          PersistenceInstanceMethods._updateRecord.call(this, block),
        ),
      ),
    )) !== false
  );
}
