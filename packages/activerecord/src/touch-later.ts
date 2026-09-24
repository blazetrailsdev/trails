import type { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { timestampAttributesForUpdateInModel, currentTimeFromProperTimezone } from "./timestamp.js";
import type { TouchArgs, TouchOptions } from "./timestamp.js";
import { extractOptionsBang } from "@blazetrails/activesupport";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import {
  addToTransaction,
  beforeCommittedBang as transactionsBeforeCommittedBang,
} from "./transactions.js";

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

  await addToTransaction.call(this);
  self._newRecordBeforeLastCommit ||= false;

  for (const r of ctor.reflectOnAllAssociations()) {
    const touch = r.options?.touch;
    if (!touch) continue;
    if (r.macro === "belongsTo") {
      await BelongsToBuilder.touchRecord(
        this,
        (this as any).changesToSave ?? {},
        r.foreignKey() ?? r.options?.foreignKey,
        r.name,
        touch,
      );
    } else if (r.macro === "hasOne") {
      await HasOneBuilder.touchRecord(this, r.name, touch);
    }
  }
}

export async function touch(
  this: Base,
  args: TouchArgs,
  superFn: (args: TouchArgs) => Promise<boolean>,
): Promise<boolean> {
  const self = this as any;
  if (hasDeferTouchAttrs(this)) {
    const names = args.slice() as unknown[];
    const { time = null } = extractOptionsBang(names) as TouchOptions;
    const merged: string[] = [
      ...new Set([...(names as string[]), ...(self._deferTouchAttrs as string[])]),
    ];
    const result = await superFn([...merged, { time }] as TouchArgs);
    self._deferTouchAttrs = null;
    self._touchTime = null;
    return result;
  }
  return superFn(args);
}

export async function beforeCommittedBang(this: Base): Promise<void> {
  if (hasDeferTouchAttrs(this) && this.isPersisted()) {
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
  self._skipDirtyTracking = true;
  await self.touch({ time: self._touchTime });
}

/** @noRailsEquivalent PERMANENT */
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
