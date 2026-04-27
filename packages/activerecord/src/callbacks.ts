/**
 * Callback lifecycle hooks for ActiveRecord persistence operations.
 *
 * In Rails, Callbacks wraps destroy/touch/increment! to fire
 * before/after hooks. Our Base class uses _callbackChain directly;
 * this module exports the callback registration helpers.
 *
 * Mirrors: ActiveRecord::Callbacks
 */

import type { Base } from "./base.js";
import { currentTimeFromProperTimezone, timestampAttributesForUpdateInModel } from "./timestamp.js";

type ModelCtor = typeof Base;

export type CallbackOptions<TRecord = Base> = {
  if?: (record: TRecord) => boolean;
  unless?: (record: TRecord) => boolean;
  prepend?: boolean;
};

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
  fn: (record: InstanceType<T>) => void | Promise<void>,
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
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: ValidationCallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "validation", fn, options);
}

/**
 * Register a before_save callback.
 *
 * Mirrors: ActiveRecord::Callbacks.before_save
 */
export function beforeSave<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void> | false,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "before", "save", fn, options);
}

/**
 * Register an after_save callback.
 *
 * Mirrors: ActiveRecord::Callbacks.after_save
 */
export function afterSave<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "save", fn, options);
}

/**
 * Register a before_create callback.
 *
 * Mirrors: ActiveRecord::Callbacks.before_create
 */
export function beforeCreate<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void> | false,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "before", "create", fn, options);
}

/**
 * Register an after_create callback.
 *
 * Mirrors: ActiveRecord::Callbacks.after_create
 */
export function afterCreate<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "create", fn, options);
}

/**
 * Register a before_update callback.
 *
 * Mirrors: ActiveRecord::Callbacks.before_update
 */
export function beforeUpdate<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void> | false,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "before", "update", fn, options);
}

/**
 * Register an after_update callback.
 *
 * Mirrors: ActiveRecord::Callbacks.after_update
 */
export function afterUpdate<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "update", fn, options);
}

/**
 * Register a before_destroy callback.
 *
 * Mirrors: ActiveRecord::Callbacks.before_destroy
 */
export function beforeDestroy<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void> | false,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "before", "destroy", fn, options);
}

/**
 * Register an after_destroy callback.
 *
 * Mirrors: ActiveRecord::Callbacks.after_destroy
 */
export function afterDestroy<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "destroy", fn, options);
}

/**
 * Register an after_find callback. Fires on every record loaded from the DB.
 *
 * Rails defines :find with only: :after, so there is no before_find or around_find.
 *
 * Mirrors: ActiveRecord::Callbacks.after_find
 */
export function afterFind<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
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
export function afterInitialize<T extends ModelCtor>(
  modelClass: T,
  fn: (record: InstanceType<T>) => void | Promise<void>,
  options?: CallbackOptions<InstanceType<T>>,
): void {
  registerCallback(modelClass, "after", "initialize", fn, options);
}

type AnyCallbackOptions = CallbackOptions<never> | ValidationCallbackOptions<never>;

function registerCallback(
  modelClass: ModelCtor,
  timing: "before" | "after",
  event: string,
  fn: Function,
  options?: AnyCallbackOptions,
): void {
  const klass = modelClass as unknown as {
    _callbackChain?: {
      clone(): unknown;
      register(
        timing: "before" | "after",
        event: string,
        fn: Function,
        conditions: Record<string, unknown>,
      ): void;
    };
  };
  if (!klass._callbackChain) return;
  // Clone the chain if it's inherited from a parent, so we don't
  // register callbacks on sibling subclasses
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_callbackChain")) {
    klass._callbackChain = klass._callbackChain.clone() as typeof klass._callbackChain;
  }
  const conditions: Record<string, unknown> = {};
  if (options?.if) conditions.if = options.if;
  if (options?.unless) conditions.unless = options.unless;
  if (options?.prepend) conditions.prepend = options.prepend;
  if (event === "validation" && "on" in (options ?? {})) {
    conditions.on = (options as ValidationCallbackOptions<never>).on;
  }
  klass._callbackChain!.register(timing, event, fn, conditions);
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::Callbacks private block.
// Rails overrides persistence methods to wrap each in _run_*_callbacks { super }.
// createOrUpdate delegates to base.ts._createOrUpdate() which runs the full
// callback+persistence cycle. _createRecord/_updateRecord wrap the underlying
// persistence work directly in their respective callback chains.
// ---------------------------------------------------------------------------

function createOrUpdate(this: any): Promise<boolean> {
  // Rails: _run_save_callbacks { super }
  return (this._createOrUpdate as () => Promise<boolean>).call(this);
}

function _createRecord(this: any): Promise<boolean> {
  // Rails: _run_create_callbacks { super } — returns whether callbacks completed.
  const ctor = this.constructor as any;
  return ctor._callbackChain.runCallbacks("create", this, async () => {
    if (!this._performInsert) throw new Error("_performInsert not implemented");
    await this._performInsert();
    if (this._pendingOperation) {
      await this._pendingOperation;
      this._pendingOperation = null;
    }
    this._previouslyNewRecord = true;
    this._newRecord = false;
    this.changesApplied();
  });
}

function _updateRecord(this: any): Promise<boolean> {
  // Rails: _run_update_callbacks { record_update_timestamps { super } } — returns boolean.
  // record_update_timestamps writes updated_at/updated_on when @_touch_record
  // and should_record_timestamps? are true, then yields to the actual update.
  const ctor = this.constructor as any;
  return ctor._callbackChain.runCallbacks("update", this, async () => {
    // Mirror record_update_timestamps: write timestamp columns before the update
    // when the model has record_timestamps enabled and has changes to save.
    // Mirror record_update_timestamps: use _skipTouch (Rails' @_touch_record flag)
    // and the shared currentTimeFromProperTimezone() helper (Temporal.Instant).
    const hasChanges = Object.keys(this.changes ?? {}).length > 0;
    if (!this._skipTouch && ctor.recordTimestamps !== false && hasChanges) {
      const time = currentTimeFromProperTimezone();
      const updateAttrs = timestampAttributesForUpdateInModel.call(ctor);
      for (const col of updateAttrs) {
        if (ctor._attributeDefinitions?.has(col) && !this.willSaveChangeToAttribute?.(col)) {
          this.writeAttribute?.(col, time);
        }
      }
    }
    if (!this._performUpdate) throw new Error("_performUpdate not implemented");
    await this._performUpdate();
    if (this._pendingOperation) {
      await this._pendingOperation;
      this._pendingOperation = null;
    }
    this._previouslyNewRecord = false;
    this.changesApplied();
  });
}
