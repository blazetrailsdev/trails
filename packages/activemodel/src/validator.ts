import type { Errors } from "./errors.js";
import { isBlank, underscore } from "@blazetrails/activesupport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRecord = any;

export type ConditionFn = ((record: AnyRecord) => boolean) | string;

export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  on?: string;
}

/**
 * Base validator interface — kept for backward compatibility with
 * existing validators that implement this shape.
 */
export interface ValidatorContract {
  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void;
}

function evaluateCondition(record: AnyRecord, cond: ConditionFn): boolean {
  if (typeof cond === "function") return cond(record);
  const method = record[cond];
  if (typeof method === "function") return method.call(record);
  return !!method;
}

export function shouldValidate(record: AnyRecord, options: ConditionalOptions): boolean {
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
export abstract class Validator {
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    const { class: _cls, ...rest } = options;
    this.options = Object.freeze(rest);
  }

  static get kind(): string {
    return underscore(this.name).replace(/_validator$/, "");
  }

  get kind(): string {
    return (this.constructor as typeof Validator).kind;
  }

  abstract validate(_record: AnyRecord): void;
}

/**
 * Iterates through attributes and calls validateEach for each one.
 *
 * Mirrors: ActiveModel::EachValidator
 */
export class EachValidator extends Validator {
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

  validate(record: AnyRecord): void {
    for (const attribute of this.attributes) {
      const value =
        typeof record.readAttribute === "function"
          ? record.readAttribute(attribute)
          : record[attribute];
      if (value == null && this.options.allowNil === true) continue;
      if (isBlank(value) && this.options.allowBlank === true) continue;
      this.validateEach(record, attribute, value);
    }
  }

  validateEach(_record: AnyRecord, _attribute: string, _value: unknown): void {
    throw new Error("Subclasses must implement validateEach(record, attribute, value)");
  }

  checkValidity(): void {
    // Override in subclasses to validate options
  }

  checkValidityBang(): void {
    this.checkValidity();
  }
}

/**
 * Receives a block and calls it for each attribute.
 *
 * Mirrors: ActiveModel::BlockValidator
 */
export class BlockValidator extends EachValidator {
  private block: (record: AnyRecord, attribute: string, value: unknown) => void;

  constructor(
    options: Record<string, unknown> & { attributes?: string | string[] },
    block: (record: AnyRecord, attribute: string, value: unknown) => void,
  ) {
    super(options);
    this.block = block;
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    this.block(record, attribute, value);
  }
}
