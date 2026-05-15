import { isBlank, underscore } from "@blazetrails/activesupport";
import type { Errors } from "./errors.js";

/** Minimum shape required of a record passed to validators. */
export interface ValidatableRecord<TBase extends object = object> {
  errors: Errors<TBase>;
}

/**
 * Universal validator control keys recognised by `validates(...)`.
 * Shared by `_validatesDefaultKeys` and `filteredErrorOptions`.
 */
export const VALIDATOR_DEFAULT_KEYS = [
  "if",
  "unless",
  "on",
  "allowBlank",
  "allowNil",
  "strict",
  "exceptOn",
] as const;

/**
 * Subset of `VALIDATOR_DEFAULT_KEYS` that must NOT be forwarded to
 * `errors.add`. `strict` is intentionally absent — `errors.add` reads it
 * to raise `StrictValidationFailed`, mirroring Rails errors.rb:342-354.
 */
const FILTER_FROM_ERROR_OPTIONS = VALIDATOR_DEFAULT_KEYS.filter(
  (k) => k !== "strict",
) as readonly string[];

export type ConditionFn = ((record: ValidatableRecord) => boolean) | string;

export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  /**
   * Validation context(s) under which this condition fires — a single
   * context name or an array. Mirrors Rails `on:` which accepts
   * `Symbol | Array<Symbol>` and intersects with the model's current
   * `validation_context` via `predicate_for_validation_context`
   * (activemodel/lib/active_model/validations.rb:294-306).
   */
  on?: string | string[];
}

export function evaluateCondition(record: ValidatableRecord, cond: ConditionFn): boolean {
  if (typeof cond === "function") return cond(record);
  const rec = record as unknown as Record<string, unknown>;
  const method = rec[cond];
  if (typeof method === "function") return (method as () => boolean).call(record);
  return !!rec[cond];
}

export function shouldValidate(record: ValidatableRecord, options: ConditionalOptions): boolean {
  if (options.if !== undefined) {
    const conds = Array.isArray(options.if) ? options.if : [options.if];
    for (const cond of conds) {
      if (!evaluateCondition(record, cond)) return false;
    }
  }
  if (options.unless !== undefined) {
    const conds = Array.isArray(options.unless) ? options.unless : [options.unless];
    for (const cond of conds) {
      if (evaluateCondition(record, cond)) return false;
    }
  }
  return true;
}

/**
 * Base validator class. Subclasses must implement validate().
 *
 * Mirrors: ActiveModel::Validator
 */
export abstract class Validator<TBase extends object = object> {
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    const { class: _cls, ...rest } = options;
    this.options = Object.freeze(rest);
  }

  static get kind(): string {
    const name = underscore(this.name);
    return name.endsWith("_validator") ? name.slice(0, -"_validator".length) : name;
  }

  get kind(): string {
    return (this.constructor as typeof Validator).kind;
  }

  abstract validate(_record: ValidatableRecord<TBase>): void;
}

/**
 * Iterates through attributes and calls validateEach for each one.
 *
 * Mirrors: ActiveModel::EachValidator
 */
export class EachValidator<TBase extends object = object> extends Validator<TBase> {
  readonly attributes: readonly string[];

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    const rawAttrs = options.attributes;
    const { attributes: _, ...rest } = options;
    super(rest);
    this.attributes = Object.freeze(
      rawAttrs === undefined ? [] : Array.isArray(rawAttrs) ? [...rawAttrs] : [rawAttrs],
    );
    if (this.attributes.length === 0 || this.attributes.some((attr) => isBlank(attr))) {
      throw new Error(":attributes cannot be blank");
    }
    this.checkValidity();
  }

  validate(record: ValidatableRecord<TBase>): void {
    for (const attribute of this.attributes) {
      let value = this.readAttributeForValidation(record, attribute);
      if (value == null && this.options.allowNil === true) continue;
      if (isBlank(value) && this.options.allowBlank === true) continue;
      value = this.prepareValueForValidation(value, record, attribute);
      this.validateEach(record, attribute, value);
    }
  }

  validateEach(_record: ValidatableRecord<TBase>, _attribute: string, _value: unknown): void {
    throw new Error("Subclasses must implement validateEach(record, attribute, value)");
  }

  checkValidityBang(): void {
    this.checkValidity();
  }

  /**
   * Mirrors: ActiveModel::EachValidator#prepare_value_for_validation
   * (validator.rb:170-172). Identity by default; subclasses (e.g.
   * NumericalityValidator) override to coerce the value before
   * validation. Wired through `validate` so subclass overrides fire.
   *
   * @internal Rails-private hook.
   */
  protected prepareValueForValidation(
    value: unknown,
    _record: ValidatableRecord<TBase>,
    _attribute: string,
  ): unknown {
    return value;
  }

  /**
   * Mirrors: ActiveModel::Validations#read_attribute_for_validation.
   * Defaults to `send(attr)` (record[attr]); ActiveRecord overrides to
   * resolve associations. Subclasses that override `validate` (e.g.
   * NumericalityValidator) reuse this helper so the lookup chain
   * stays in one place.
   */
  protected readAttributeForValidation(
    record: ValidatableRecord<TBase>,
    attribute: string,
  ): unknown {
    const rec = record as unknown as Record<string, unknown>;
    if (typeof rec.readAttributeForValidation === "function") {
      return (rec.readAttributeForValidation as (a: string) => unknown)(attribute);
    }
    if (typeof rec.readAttribute === "function") {
      return (rec.readAttribute as (a: string) => unknown)(attribute);
    }
    return rec[attribute];
  }

  /**
   * Returns `this.options` minus universal validator control keys and any
   * additional validator-specific reserved keys, for forwarding to
   * `errors.add` as i18n interpolation variables.
   *
   * Mirrors the `options.except(*RESERVED_OPTIONS)` pattern used in Rails
   * validators (e.g. acceptance.rb:31, confirmation.rb:19).
   *
   * @internal Rails-private helper.
   */
  filteredErrorOptions(additionalReserved: string[] = []): Record<string, unknown> {
    const reserved = new Set([...FILTER_FROM_ERROR_OPTIONS, ...additionalReserved]);
    const filtered: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(this.options)) {
      if (!reserved.has(key)) filtered[key] = val;
    }
    return filtered;
  }

  checkValidity(): void {
    // Override in subclasses to validate options
  }
}

/**
 * Receives a block and calls it for each attribute.
 *
 * Mirrors: ActiveModel::BlockValidator
 */
export class BlockValidator<TBase extends object = object> extends EachValidator<TBase> {
  private block: (record: ValidatableRecord<TBase>, attribute: string, value: unknown) => void;

  constructor(
    options: Record<string, unknown> & { attributes?: string | string[] },
    block: (record: ValidatableRecord<TBase>, attribute: string, value: unknown) => void,
  ) {
    super(options);
    this.block = block;
  }

  validateEach(record: ValidatableRecord<TBase>, attribute: string, value: unknown): void {
    this.block(record, attribute, value);
  }
}
