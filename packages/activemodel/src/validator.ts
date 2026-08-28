import { isBlank, underscore } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError } from "./attribute-assignment.js";
import type { Errors } from "./errors.js";

export interface ValidatableRecord<TBase extends object = object> {
  errors: Errors<TBase>;
}

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

  checkValidityBang(): void {}

  /** @internal */
  protected prepareValueForValidation(
    value: unknown,
    _record: ValidatableRecord<TBase>,
    _attrName: string,
  ): unknown {
    return value;
  }

  protected readAttributeForValidation(
    record: ValidatableRecord<TBase>,
    attribute: string,
  ): unknown {
    const rec = record as unknown as Record<string, unknown>;
    if (typeof rec.readAttributeForValidation === "function") {
      return (rec.readAttributeForValidation as (a: string) => unknown)(attribute);
    }
    if (typeof rec._readAttribute === "function") {
      return (rec._readAttribute as (a: string) => unknown)(attribute);
    }
    return rec[attribute];
  }
}

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
