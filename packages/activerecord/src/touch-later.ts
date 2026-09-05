import type { Base } from "./base.js";
import { ActiveRecordError, ReadOnlyRecord } from "./errors.js";
import {
  touch as timestampTouch,
  timestampAttributesForUpdateInModel,
  currentTimeFromProperTimezone,
} from "./timestamp.js";
import { parseTouchArgs, type TouchArgs } from "./timestamp.js";
import type { Time as RubyTime } from "@blazetrails/date";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { beforeCommittedBang as transactionsBeforeCommittedBang } from "./transactions.js";
import { isAppliedTo as isNoTouchingApplied } from "./no-touching.js";

function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

export async function touchLater(this: Base, ...names: string[]): Promise<void> {
  if (!this.isPersisted()) raiseRecordNotTouchedError();
  if (this.isReadonly()) throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  if (isNoTouchingApplied(this.constructor as typeof Base)) return;

  const ctor = this.constructor as typeof Base;
  const self = this as any;

  if (!self._deferTouchAttrs) {
    self._deferTouchAttrs = [...timestampAttributesForUpdateInModel.call(ctor)];
  }

  if (names.length > 0) {
    const aliases: Record<string, string> = (ctor as any).attributeAliases ?? {};
    for (const name of names) {
      const resolved = aliases[name] ?? name;
      if (!self._deferTouchAttrs.includes(resolved)) self._deferTouchAttrs.push(resolved);
    }
  }

  self._touchTime = currentTimeFromProperTimezone();
  surreptitiouslyTouch.call(this, self._deferTouchAttrs as string[]);

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

  for (const r of ctor.reflectOnAllAssociations()) {
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

export async function touch(this: Base, ...args: TouchArgs): Promise<boolean> {
  const self = this as any;
  if (self._deferTouchAttrs?.length) {
    const deferredAttrs = self._deferTouchAttrs as string[];
    const deferredTime = self._touchTime as RubyTime | null;
    const { names, time } = parseTouchArgs(args);
    const merged: string[] = [...new Set([...names, ...deferredAttrs])];
    self._deferTouchAttrs = null;
    self._touchTime = null;
    try {
      return await timestampTouch.call(this, ...merged, { time });
    } catch (error) {
      self._deferTouchAttrs = deferredAttrs;
      self._touchTime = deferredTime;
      throw error;
    }
  }
  return timestampTouch.call(this, ...args);
}

export async function beforeCommittedBang(this: Base): Promise<void> {
  const self = this as any;
  if (self._deferTouchAttrs?.length && this.isPersisted()) {
    await touchDeferredAttributes.call(this);
  }
  await transactionsBeforeCommittedBang(this);
}

/** @internal */
export function surreptitiouslyTouch(this: Base, attrNames: string[]): void {
  const time = (this as any)._touchTime;
  for (const attrName of attrNames) {
    (this as any).writeAttribute(attrName, time);
    if (typeof (this as any).clearAttributeChange === "function") {
      (this as any).clearAttributeChange(attrName);
    } else if (typeof (this as any).clearAttributeChanges === "function") {
      (this as any).clearAttributeChanges([attrName]);
    }
  }
}

/** @internal */
export async function touchDeferredAttributes(this: Base): Promise<void> {
  const self = this as any;
  const deferredAttrs = (self._deferTouchAttrs as string[]) ?? [];
  const time = (self._touchTime as RubyTime | null) ?? currentTimeFromProperTimezone();
  self._deferTouchAttrs = null;
  self._touchTime = null;
  self._skipDirtyTracking = true;
  try {
    await timestampTouch.call(this, ...deferredAttrs, { time });
  } catch (error) {
    self._deferTouchAttrs = deferredAttrs;
    self._touchTime = time;
    throw error;
  } finally {
    self._skipDirtyTracking = null;
  }
}

export const InstanceMethods = {
  touchLater,
  touch,
  beforeCommittedBang,
};

/** @internal */
export function initInternals(this: any, super_: () => void): void {
  super_();
  this._deferTouchAttrs = null;
  this._touchTime = null;
}

/** @internal */
export function hasDeferTouchAttrs(record: any): boolean {
  const attrs = record._deferTouchAttrs;
  return Array.isArray(attrs) && attrs.length > 0;
}
