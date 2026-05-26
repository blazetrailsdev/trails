import type { Base } from "./base.js";
import { ActiveRecordError, ReadOnlyRecord } from "./errors.js";
import {
  touch as timestampTouch,
  timestampAttributesForUpdateInModel,
  currentTimeFromProperTimezone,
} from "./timestamp.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { reflectOnAllAssociations } from "./reflection.js";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { beforeCommittedBang as transactionsBeforeCommittedBang } from "./transactions.js";
import { isAppliedTo as isNoTouchingApplied } from "./no-touching.js";

/**
 * Deferred-touch mixin.
 *
 * When called inside a transaction, `touchLater` writes timestamp attrs
 * in-memory (without marking dirty) and defers the DB UPDATE to
 * `beforeCommitted!`, which fires just before the transaction commits.
 *
 * Mirrors: ActiveRecord::TouchLater
 */

function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

/**
 * Defer touching timestamp columns until before_committed!.
 * Writes values in-memory immediately without marking dirty so associations
 * that read the attribute see the updated time before the commit.
 *
 * Mirrors: ActiveRecord::TouchLater#touch_later
 */
export async function touchLater(this: Base, ...names: string[]): Promise<void> {
  if (!this.isPersisted()) raiseRecordNotTouchedError();
  if (this.isReadonly()) throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  if (isNoTouchingApplied(this.constructor as typeof Base)) return;

  const ctor = this.constructor as typeof Base;
  const self = this as any;

  if (!self._deferTouchAttrs) {
    self._deferTouchAttrs = [...(timestampAttributesForUpdateInModel.call(ctor) as string[])];
  }

  if (names.length > 0) {
    const aliases: Record<string, string> = (ctor as any)._attributeAliases ?? {};
    for (const name of names) {
      const resolved = aliases[name] ?? name;
      if (!self._deferTouchAttrs.includes(resolved)) self._deferTouchAttrs.push(resolved);
    }
  }

  self._touchTime = currentTimeFromProperTimezone();
  surreptitiouslyTouch.call(this, self._deferTouchAttrs as string[]);

  // Register with the current transaction so beforeCommitted! fires before
  // commit — mirrors Rails' add_to_transaction call in touch_later.
  // Only defer when the adapter supports addTransactionRecord AND a real
  // (non-null) transaction is currently open. NullTransaction.addRecord is
  // a no-op, so deferring into it would silently lose the flush.
  const adapter = ctor.connection as any;
  const hasAddRecord = typeof adapter?.addTransactionRecord === "function";
  const currentTx =
    typeof adapter?.currentTransaction === "function" ? adapter.currentTransaction() : null;
  const hasOpenRealTransaction =
    hasAddRecord &&
    currentTx != null &&
    currentTx.open === true &&
    typeof currentTx.addRecord === "function";
  if (hasOpenRealTransaction) {
    adapter.addTransactionRecord(this);
  } else {
    await touchDeferredAttributes.call(this);
    return;
  }

  // Touch belongs_to / has_one parents that have touch: option — mirrors the
  // reflect_on_all_associations loop in Rails' touch_later.
  for (const r of reflectOnAllAssociations(ctor)) {
    const touch = r.options?.touch;
    if (!touch) continue;
    if (r.macro === "belongsTo") {
      await BelongsToBuilder.touchRecord(
        this,
        (this as any).changesToSave ?? {},
        r.foreignKey ?? r.options?.foreignKey,
        r.name,
        touch,
      );
    } else if (r.macro === "hasOne") {
      await HasOneBuilder.touchRecord(this, r.name, touch);
    }
  }
}

/**
 * If deferred attrs are pending, merge them into the normal touch call so they
 * all flush in a single UPDATE, then clear deferred state.
 *
 * Mirrors: ActiveRecord::TouchLater#touch
 */
export async function touch(this: Base, ...names: string[]): Promise<boolean> {
  const self = this as any;
  if (self._deferTouchAttrs?.length) {
    const deferredAttrs = self._deferTouchAttrs as string[];
    const deferredTime = self._touchTime as Temporal.Instant | null;
    const merged: string[] = [...new Set([...names, ...deferredAttrs])];
    self._deferTouchAttrs = null;
    self._touchTime = null;
    try {
      return await timestampTouch.call(this, ...merged);
    } catch (error) {
      self._deferTouchAttrs = deferredAttrs;
      self._touchTime = deferredTime;
      throw error;
    }
  }
  return timestampTouch.call(this, ...names);
}

/**
 * Flush deferred touch attrs before the record's transaction commits,
 * then run before_commit callbacks (super).
 *
 * Mirrors: ActiveRecord::TouchLater#before_committed!
 */
export async function beforeCommittedBang(this: Base): Promise<void> {
  const self = this as any;
  if (self._deferTouchAttrs?.length && this.isPersisted()) {
    await touchDeferredAttributes.call(this);
  }
  await transactionsBeforeCommittedBang(this);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** @internal */
export function surreptitiouslyTouch(this: Base, attrNames: string[]): void {
  const time = (this as any)._touchTime;
  for (const attr of attrNames) {
    (this as any).writeAttribute(attr, time);
    // Per-attribute clear so the baseline rebinds to the touched value;
    // otherwise a later write would diff against the pre-touch original.
    if (typeof (this as any).clearAttributeChange === "function") {
      (this as any).clearAttributeChange(attr);
    } else if (typeof (this as any).clearAttributeChanges === "function") {
      (this as any).clearAttributeChanges([attr]);
    }
  }
}

/** @internal */
export async function touchDeferredAttributes(this: Base): Promise<void> {
  const self = this as any;
  const deferredAttrs = (self._deferTouchAttrs as string[]) ?? [];
  const time = (self._touchTime as Temporal.Instant | null) ?? currentTimeFromProperTimezone();
  self._deferTouchAttrs = null;
  self._touchTime = null;
  // Mirrors Rails: touch(time: @_touch_time). Passes the deferred timestamp
  // through the canonical touch path (type casting, locking, after_touch).
  // On failure, restore deferred state so the touch can be retried —
  // mirrors touch_later.rb where @_defer_touch_attrs/@_touch_time are cleared
  // only after the super call succeeds.
  try {
    await timestampTouch.call(this, { time }, ...deferredAttrs);
  } catch (error) {
    self._deferTouchAttrs = deferredAttrs;
    self._touchTime = time;
    throw error;
  }
}

export const InstanceMethods = {
  touchLater,
  touch,
  beforeCommittedBang,
};

/**
 * Initialize deferred-touch state on a record during init_internals.
 *
 * Mirrors: ActiveRecord::TouchLater#init_internals (private)
 *
 * @internal
 */
export function initInternals(record: any): void {
  record._deferTouchAttrs = null;
  record._touchTime = null;
}

/**
 * Returns true when the record has pending deferred touch attributes.
 *
 * Mirrors: ActiveRecord::TouchLater#has_defer_touch_attrs? (private)
 *
 * @internal
 */
export function hasDeferTouchAttrs(record: any): boolean {
  const attrs = record._deferTouchAttrs;
  return Array.isArray(attrs) && attrs.length > 0;
}
