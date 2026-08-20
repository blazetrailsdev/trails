import { isBlank, underscore } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError } from "./attribute-assignment.js";
import type { Errors } from "./errors.js";

/** Minimum shape required of a record passed to validators. */
export interface ValidatableRecord<TBase extends object = object> {
  errors: Errors<TBase>;
}

/**
 * Base validator class. Subclasses must implement validate().
 *
 * Mirrors: ActiveModel::Validator
 */
export abstract class Validator<TBase extends object = object> {
  readonly options: Record<string, unknown>;

  static get kind(): string {
    const name = underscore(this.name);
    return name.endsWith("_validator") ? name.slice(0, -"_validator".length) : name;
  }

  constructor(options: Record<string, unknown> = {}) {
    const { class: _cls, ...rest } = options;
    this.options = Object.freeze(rest);
  }

  get kind(): string {
    return (this.constructor as typeof Validator).kind;
  }

  abstract validate(_record: ValidatableRecord<TBase>): void | Promise<void>;
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
      throw new ArgumentError(":attributes cannot be blank");
    }
    this.checkValidityBang();
  }

  async validate(record: ValidatableRecord<TBase>): Promise<void> {
    for (const attribute of this.attributes) {
      let value = this.readAttributeForValidation(record, attribute);
      if (value == null && this.options.allowNil === true) continue;
      if (isBlank(value) && this.options.allowBlank === true) continue;
      value = this.prepareValueForValidation(value, record, attribute);
      await this.validateEach(record, attribute, value);
    }
  }

  validateEach(
    _record: ValidatableRecord<TBase>,
    _attribute: string,
    _value: unknown,
  ): void | Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activemodel/lib/active_model/validator.rb:162 cluster=activemodel-validator
    throw new NotImplementedError(
      "Subclasses must implement validateEach(record, attribute, value)",
    );
  }

  /**
   * Hook method that gets called by the initializer allowing verification
   * that the arguments supplied are valid. Mirrors
   * `EachValidator#check_validity!` (validator.rb:167-168).
   */
  checkValidityBang(): void {}

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
