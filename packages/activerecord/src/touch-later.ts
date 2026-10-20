import type { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import type { TouchArgs, TouchOptions } from "./timestamp.js";
import { extractOptionsBang } from "@blazetrails/activesupport";
import { Module, union } from "@blazetrails/ruby-compat";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { addToTransaction } from "./transactions.js";

export const TouchLater = new Module();

type TouchLaterHost = Base & {
  _deferTouchAttrs?: readonly string[] | null;
  _touchTime?: unknown;
  _skipDirtyTracking?: boolean | null;
  _newRecordBeforeLastCommit?: boolean | null;
};

function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

export async function touchLater(this: TouchLaterHost, ...names: string[]): Promise<void> {
  if (!this.isPersisted()) raiseRecordNotTouchedError();

  const ctor = this.constructor;

  this._deferTouchAttrs ??= this.timestampAttributesForUpdateInModel();
  if (names.length > 0) {
    this._deferTouchAttrs = [
      ...new Set([
        ...this._deferTouchAttrs,
        ...names.map((name) => {
          name = String(name);
          return ctor.attributeAliases[name] ?? name;
        }),
      ]),
    ];
  }

  this._touchTime = await this.currentTimeFromProperTimezone();
  surreptitiouslyTouch.call(this, this._deferTouchAttrs);

  await addToTransaction.call(this);
  this._newRecordBeforeLastCommit ||= false;

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

export async function touch(this: TouchLaterHost, ...names: TouchArgs): Promise<boolean> {
  if (hasDeferTouchAttrs(this)) {
    const { time = null } = extractOptionsBang(names as unknown[]) as TouchOptions;
    names = union(names as string[], [...this._deferTouchAttrs!]);
    const result = await TouchLater.superMethod(this, "touch")!(...names, { time });
    this._deferTouchAttrs = null;
    this._touchTime = null;
    return result as boolean;
  } else {
    return TouchLater.superMethod(this, "touch")!(...names) as Promise<boolean>;
  }
}

export async function beforeCommittedBang(this: TouchLaterHost): Promise<void> {
  if (hasDeferTouchAttrs(this) && this.isPersisted()) {
    await touchDeferredAttributes.call(this);
  }
  await TouchLater.superMethod(this, "beforeCommittedBang")!();
}

/** @internal */
export function surreptitiouslyTouch(this: TouchLaterHost, attrNames: readonly string[]): void {
  for (const attrName of attrNames) {
    this._writeAttribute(attrName, this._touchTime);
    this.clearAttributeChange(attrName);
  }
}

/** @internal */
export async function touchDeferredAttributes(this: TouchLaterHost): Promise<void> {
  this._skipDirtyTracking = true;
  await this.touch({ time: this._touchTime as TouchOptions["time"] });
}

/** @internal */
export function initInternals(this: TouchLaterHost): void {
  TouchLater.superMethod(this, "initInternals")!();
  this._deferTouchAttrs = null;
  this._touchTime = null;
}

/** @internal */
export function hasDeferTouchAttrs(record: TouchLaterHost): boolean {
  const attrs = record._deferTouchAttrs;
  return Array.isArray(attrs) && attrs.length > 0;
}

TouchLater.defineMethod("beforeCommittedBang", beforeCommittedBang);
TouchLater.defineMethod("touchLater", touchLater);
TouchLater.defineMethod("touch", touch);
TouchLater.defineMethod("initInternals", initInternals);
