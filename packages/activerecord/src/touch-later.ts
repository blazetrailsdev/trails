import type { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import type { TouchArgs, TouchOptions } from "./timestamp.js";
import { extractOptionsBang } from "@blazetrails/activesupport";
import { Module, union } from "@blazetrails/ruby-compat";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { addToTransaction } from "./transactions.js";

export const TouchLater = new Module();

function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

export async function touchLater(this: Base, ...names: string[]): Promise<void> {
  if (!this.isPersisted()) raiseRecordNotTouchedError();

  const ctor = this.constructor as typeof Base;
  const self = this as any;

  self._deferTouchAttrs ??= self.timestampAttributesForUpdateInModel();
  if (names.length > 0) {
    self._deferTouchAttrs = [
      ...new Set([
        ...self._deferTouchAttrs,
        ...names.map((name) => {
          name = String(name);
          return ctor.attributeAliases[name] ?? name;
        }),
      ]),
    ];
  }

  self._touchTime = await self.currentTimeFromProperTimezone();
  surreptitiouslyTouch.call(this, self._deferTouchAttrs);

  await addToTransaction.call(this);
  self._newRecordBeforeLastCommit ||= false;

  for (const r of ctor.reflectOnAllAssociations()) {
    const touch = r.options.touch;
    if (touch != null && touch !== false) {
      if (r.macro === "belongsTo") {
        await BelongsToBuilder.touchRecord(
          this,
          (this as any).changesToSave,
          r.foreignKey(),
          r.name,
          touch,
        );
      } else if (r.macro === "hasOne") {
        await HasOneBuilder.touchRecord(this, r.name, touch);
      }
    }
  }
}

export async function touch(this: Base, ...names: TouchArgs): Promise<boolean> {
  const self = this as any;
  if (hasDeferTouchAttrs(this)) {
    const { time = null } = extractOptionsBang(names as unknown[]) as TouchOptions;
    names = union(names as string[], self._deferTouchAttrs as string[]);
    const result = await TouchLater.superMethod(this, "touch")!(...names, { time });
    self._deferTouchAttrs = null;
    self._touchTime = null;
    return result as boolean;
  } else {
    return TouchLater.superMethod(this, "touch")!(...names) as Promise<boolean>;
  }
}

export async function beforeCommittedBang(this: Base): Promise<void> {
  if (hasDeferTouchAttrs(this) && this.isPersisted()) {
    await touchDeferredAttributes.call(this);
  }
  await TouchLater.superMethod(this, "beforeCommittedBang")!();
}

/** @internal */
export function surreptitiouslyTouch(this: Base, attrNames: readonly string[]): void {
  for (const attrName of attrNames) {
    this._writeAttribute(attrName, (this as any)._touchTime);
    this.clearAttributeChange(attrName);
  }
}

/** @internal */
export async function touchDeferredAttributes(this: Base): Promise<void> {
  const self = this as any;
  self._skipDirtyTracking = true;
  await self.touch({ time: self._touchTime });
}

/** @internal */
export function initInternals(this: any): void {
  TouchLater.superMethod(this, "initInternals")!();
  this._deferTouchAttrs = null;
  this._touchTime = null;
}

/** @internal */
export function hasDeferTouchAttrs(record: any): boolean {
  const attrs = record._deferTouchAttrs;
  return Array.isArray(attrs) && attrs.length > 0;
}

TouchLater.defineMethod("beforeCommittedBang", beforeCommittedBang);
TouchLater.defineMethod("touchLater", touchLater);
TouchLater.defineMethod("touch", touch);
TouchLater.defineMethod("initInternals", initInternals);
