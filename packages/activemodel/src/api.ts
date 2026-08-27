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

/** The class Ruby's `included(base)` hook receives (api.rb:65). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type IncludingClass = (new (...args: any[]) => any) & { prototype: object };

/**
 * Mirrors: ActiveModel::API#initialize (api.rb:78-81)
 *
 *   def initialize(attributes = {})
 *     assign_attributes(attributes) if attributes
 *     super()
 *   end
 *
 * Ruby's `initialize` on an included module runs as part of the host's
 * constructor chain via `super`; TypeScript has no expression for that —
 * `include()` copies prototype members and cannot install a constructor — so
 * the port keeps the Rails name as an exported function each including class
 * calls from its own constructor, the same shape
 * `ActiveSupport::Messages::Rotator#initialize` already uses.
 */
export function initialize(this: APIHost, attributes: Record<string, unknown> = {}): void {
  // AR's override of `_assign_attributes` can owe I/O; Rails' `initialize`
  // does not await it either — the writes drain on save (RFC 0087).
  if (attributes != null) void this.assignAttributes(attributes);
}

/**
 * Mirrors: ActiveModel::API (api.rb:58-98) — the Concern any class becomes a
 * model with, by `include ActiveModel::API` (api.rb:14-17). A class module
 * rather than a plain object because `include()`'s class branch is what carries
 * accessor descriptors across the mixin.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (api.rb:58); the class/interface merge is how `include()` surfaces on the type side.
export class API {
  /**
   * Mirrors: api.rb:60-68
   *
   *   include ActiveModel::AttributeAssignment
   *   include ActiveModel::Validations
   *   include ActiveModel::Conversion
   *
   *   included do
   *     extend ActiveModel::Naming
   *     extend ActiveModel::Translation
   *   end
   */
  static [included](base: IncludingClass): void {
    // api.rb:61 — `include ActiveModel::AttributeAssignment`, which itself
    // includes `ForbiddenAttributesProtection` (attribute_assignment.rb:7);
    // `include()` copies a module's own members, not its nested includes.
    include(base, {
      assignAttributes,
      setAttributes,
      attributeWriterMissing,
      _assignAttributes,
      _assignAttribute,
    });

    // attribute_assignment.rb:7 — `include ActiveModel::ForbiddenAttributesProtection`,
    // which the include above brings along in Ruby; `include()` copies a
    // module's own members, not its nested includes, so the module goes on
    // itself here.
    include(base, ForbiddenAttributesProtection);

    // api.rb:62 — `include ActiveModel::Validations`. The module's own
    // `[included]` hook issues its `ClassMethods` half and its `included do`
    // block, exactly as Ruby's Concern does.
    include(base, Validations);

    // api.rb:63 — `include ActiveModel::Conversion` and its `ClassMethods`
    // half (conversion.rb:105-118); the `included do` block (:28-33) rides
    // along from the module's own hook.
    include(base, Conversion);
    extend(base, ConversionClassMethods);

    // api.rb:66-67 — the `included do` block. The `Naming.extended` hook
    // (naming.rb:253-256) installs the instance delegate.
    extend(base, Naming);
    extend(base, Translation);
  }

  /**
   * Mirrors: ActiveModel::API#persisted? (api.rb:95-97) — indicates if the
   * model is persisted. Default is +false+.
   */
  isPersisted(): boolean {
    return false;
  }
}

/**
 * The instance surface `include ActiveModel::API` contributes: the members of
 * `AttributeAssignment`, `Validations` and `Conversion` (api.rb:61-63), plus
 * `persisted?` (api.rb:95-97). `Conversion` and `Naming` arrive through the
 * class modules themselves; the rest are declared here because `Included<>`
 * cannot derive an accessor's type across the mixin.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (api.rb:58); the class/interface merge is how `include()` surfaces on the type side.
export interface API extends Conversion {
  /** `include ActiveModel::AttributeAssignment` (api.rb:61). */
  assignAttributes(newAttributes: unknown): Promise<void> | void;
  setAttributes(newAttributes: unknown): Promise<void> | void;
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;
  /**
   * `include ActiveModel::ForbiddenAttributesProtection`
   * (attribute_assignment.rb:7).
   *
   * @internal
   */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  /** @internal */
  sanitizeForbiddenAttributes(attributes: Record<string, unknown>): Record<string, unknown>;

  /**
   * `include ActiveModel::Validations` (api.rb:62).
   *
   * @internal
   */
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

  /**
   * `ActiveModel::Validations#validates_with` (validations/with.rb:144-151),
   * and the instance `validates_*_of` shorthands `Validations.[included]`
   * mixes in (validations.rb:46). The instance `validates_with` is async
   * (RFC 0063), so these settle where Ruby's return straight away.
   */
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

/** The host shape {@link initialize} assigns through. */
interface APIHost {
  assignAttributes(newAttributes: unknown): Promise<void> | void;
}
