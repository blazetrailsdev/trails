import { extend, include, included } from "@blazetrails/activesupport";
import {
  assignAttributes,
  setAttributes,
  attributeWriterMissing,
  _assignAttributes,
  _assignAttribute,
} from "./attribute-assignment.js";
import { ForbiddenAttributesProtection } from "./forbidden-attributes-protection.js";
import { Validations, type ValidationContext } from "./validations.js";
import type { AttrNameArg } from "./validations/helper-methods.js";
import type { validatesWith as withValidatesWith } from "./validations/with.js";
import { Conversion, ClassMethods as ConversionClassMethods } from "./conversion.js";
import { Naming } from "./naming.js";
import { Translation } from "./translation.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type IncludingClass = (new (...args: any[]) => any) & { prototype: object };

export function initialize(this: APIHost, attributes: Record<string, unknown> = {}): void {
  if (attributes != null) void this.assignAttributes(attributes);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (api.rb:58); the class/interface merge is how `include()` surfaces on the type side.
export class API {
  static [included](base: IncludingClass): void {
    include(base, {
      assignAttributes,
      setAttributes,
      attributeWriterMissing,
      _assignAttributes,
      _assignAttribute,
    });

    include(base, ForbiddenAttributesProtection);

    include(base, Validations);

    include(base, Conversion);
    extend(base, ConversionClassMethods);

    extend(base, Naming);
    extend(base, Translation);
  }

  isPersisted(): boolean {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (api.rb:58); the class/interface merge is how `include()` surfaces on the type side.
export interface API extends Conversion {
  assignAttributes(newAttributes: unknown): Promise<void> | void;
  setAttributes(newAttributes: unknown): Promise<void> | void;
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  /** @internal */
  sanitizeForbiddenAttributes(attributes: Record<string, unknown>): Record<string, unknown>;

  /** @internal */
  contextForValidation(): ValidationContext;
  /** @internal */
  runValidationsBang(): Promise<boolean>;
  raiseValidationError(): never;
  readAttributeForValidation(attribute: string): unknown;
  isValid(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  validate(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  isInvalid(context?: string | string[] | ValidationContext | null): Promise<boolean>;
  validateBang(context?: string | string[] | ValidationContext | null): Promise<true>;
  readonly validationContext: string | string[] | null;
  /** @internal */
  _validationContext: string | string[] | null;
  /** @internal */
  _runValidateCallbacks(): Promise<void>;
  freeze(): this;

  validatesWith: typeof withValidatesWith;
  validatesPresenceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesAbsenceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesLengthOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesSizeOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesNumericalityOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesInclusionOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesExclusionOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesFormatOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesAcceptanceOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesConfirmationOf(...attrNames: AttrNameArg[]): Promise<void>;
  validatesComparisonOf(...attrNames: AttrNameArg[]): Promise<void>;
}

interface APIHost {
  assignAttributes(newAttributes: unknown): Promise<void> | void;
}
