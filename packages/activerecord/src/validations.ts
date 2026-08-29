import type { AttrNameArg, ValidationContext } from "@blazetrails/activemodel";
import { I18n } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";

export type ValidationContextArg = string | string[] | ValidationContext | null;
import { AbsenceValidator } from "./validations/absence.js";
import { AssociatedValidator, validatesAssociated } from "./validations/associated.js";
import { LengthValidator } from "./validations/length.js";
import { NumericalityValidator } from "./validations/numericality.js";
import { PresenceValidator } from "./validations/presence.js";
import { UniquenessValidator, validatesUniquenessOf } from "./validations/uniqueness.js";
import { associationInstanceGet } from "./associations.js";
import type { Association } from "./associations/association.js";
import type { Base } from "./base.js";

export {
  AbsenceValidator,
  AssociatedValidator,
  LengthValidator,
  NumericalityValidator,
  PresenceValidator,
  UniquenessValidator,
  validatesAssociated,
  validatesUniquenessOf,
};

export class RecordInvalid extends ActiveRecordError {
  readonly record: any;

  constructor(record: any) {
    let message: string;
    if (record) {
      const errors = (record.errors?.fullMessages as string[] | undefined)?.join(", ") ?? "";
      message = I18n.t(`${record.constructor.i18nScope}.errors.messages.record_invalid`, {
        errors,
        default: ":errors.messages.record_invalid",
      }) as string;
    } else {
      message = "Record invalid";
    }
    super(message);
    this.name = "RecordInvalid";
    this.record = record;
  }
}

export interface Validations {
  validate(context?: ValidationContextArg): Promise<boolean>;
  isValid(context?: ValidationContextArg): Promise<boolean>;
}

export interface ValidationsClassMethods {
  validatesAbsenceOf(...attrNames: AttrNameArg[]): void;
  validatesLengthOf(...attrNames: AttrNameArg[]): void;
  validatesSizeOf(...attrNames: AttrNameArg[]): void;
  validatesNumericalityOf(...attrNames: AttrNameArg[]): void;
  validatesPresenceOf(...attrNames: AttrNameArg[]): void;
  validatesAssociated(...attrNames: AttrNameArg[]): void;
  validatesUniquenessOf(...attrNames: AttrNameArg[]): void;
}

interface ValidationsHost {
  _validationContext?: ValidationContextArg;
  isNewRecord?(): boolean;
  _newRecord?: boolean;
  errors: { any: boolean };
  isValid(context?: ValidationContextArg): Promise<boolean>;
  _associationCache?(name: string): { target?: unknown } | undefined;
  _collectionProxies?: { get?(name: string): unknown };
  association?(name: string): { loaded?: boolean; target?: unknown } | undefined;
  readAttribute(name: string): unknown;
}

let _superIsValid: ((context?: ValidationContextArg) => Promise<boolean>) | null = null;

/** @internal */
export function _setSuperIsValid(fn: (context?: ValidationContextArg) => Promise<boolean>): void {
  _superIsValid = fn;
}

export async function isValid(
  this: ValidationsHost,
  context?: ValidationContextArg,
): Promise<boolean> {
  const effectiveContext =
    context ?? this._validationContext ?? defaultValidationContext.call(this);
  if (_superIsValid == null) {
    throw new ActiveRecordError(
      "ActiveRecord::Validations#isValid called before Base registered the super isValid",
    );
  }
  const previousContext = this._validationContext;
  this._validationContext = effectiveContext;
  try {
    const result = await _superIsValid.call(this, effectiveContext);
    return result && !this.errors.any;
  } finally {
    this._validationContext = previousContext;
  }
}

export function validate(this: ValidationsHost, context?: ValidationContextArg): Promise<boolean> {
  return isValid.call(this, context);
}

export function customValidationContext(this: ValidationsHost): boolean {
  const ctx = this._validationContext;
  return ctx != null && ctx !== "create" && ctx !== "update";
}

/** @internal */
export function defaultValidationContext(this: ValidationsHost): string {
  return this.isNewRecord?.() || this._newRecord ? "create" : "update";
}

/** @internal */
export function performValidations(
  this: ValidationsHost,
  options?: { validate?: boolean; context?: string },
): Promise<boolean> {
  if (options?.validate === false) return Promise.resolve(true);
  return this.isValid(options?.context);
}

export function readAttributeForValidation(this: ValidationsHost, attribute: string): unknown {
  const proxy = this._collectionProxies?.get?.(attribute) as
    | { loaded?: boolean; target?: unknown[] }
    | undefined;
  if (
    proxy &&
    (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
  ) {
    return proxy.target;
  }
  if (typeof this.association === "function") {
    try {
      const assoc = this.association(attribute);
      if (assoc && (assoc.loaded === true || assoc.target != null)) return assoc.target;
    } catch {}
  }
  const cached = this._associationCache?.(attribute)?.target;
  if (cached !== undefined) return cached;
  const holder = associationInstanceGet.call(
    this as unknown as Base,
    attribute,
  ) as Association | null;
  if (holder?.isLoaded() && !(holder._staleStateIsSnapshotted && holder.isStaleTarget())) {
    return holder.target ?? null;
  }
  return this.readAttribute(attribute);
}

interface HelperMethodHost {
  validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
}

export function validatesPresenceOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(PresenceValidator, this._mergeAttributes(attrNames));
}

export function validatesAbsenceOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
}

export function validatesLengthOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
}

export function validatesSizeOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
}

export function validatesNumericalityOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(NumericalityValidator, this._mergeAttributes(attrNames));
}

export const ClassMethods = {
  validatesAssociated,
  validatesUniquenessOf,
  validatesPresenceOf,
  validatesAbsenceOf,
  validatesLengthOf,
  validatesSizeOf,
  validatesNumericalityOf,
};

/** @internal */
export function raiseValidationError(record: unknown): never {
  throw new RecordInvalid(record);
}
