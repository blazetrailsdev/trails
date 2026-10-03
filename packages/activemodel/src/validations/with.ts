import { extractOptionsBang } from "@blazetrails/activesupport";
import type { Hash } from "@blazetrails/ruby-compat";
import { dup as hashDup, rbBlockGivenP, rbFSend, rbObjMethod } from "@blazetrails/ruby-compat";

import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";

export class WithValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attr: string, _val: unknown): void {
    const methodName = this.options.with;

    if (rbObjMethod(record, methodName).arity() === 0) {
      rbFSend(record, methodName);
    } else {
      rbFSend(record, methodName, attr);
    }
  }
}

type ValidatorLike = { validate(record: ValidatableRecord): unknown };

type ValidatorBlock = (record: ValidatableRecord, attribute: string, value: unknown) => void;

type ValidatorClass = new (
  options: Record<string, unknown>,
  block?: ValidatorBlock,
) => ValidatorLike;

export interface ValidatesWithClassHost {
  _validators: Hash<string | null, ValidatorLike[]>;
  validate(
    filter: ValidatorLike | ((record: ValidatableRecord) => unknown),
    options?: Record<string, unknown>,
  ): void;
}

export async function validatesWith(
  this: ValidatableRecord,
  ...args: Array<ValidatorClass | Record<string, unknown> | ValidatorBlock>
): Promise<void> {
  const block = rbBlockGivenP(args[args.length - 1]) ? (args.pop() as ValidatorBlock) : undefined;
  const options = extractOptionsBang(args);
  options.class = this.constructor;

  for (const klass of args as ValidatorClass[]) {
    const validator = new klass({ ...options }, block);
    await validator.validate(this);
  }
}

export const ClassMethods = {
  validatesWith(
    this: ValidatesWithClassHost,
    ...args: Array<ValidatorClass | Record<string, unknown> | ValidatorBlock>
  ): void {
    const block = rbBlockGivenP(args[args.length - 1]) ? (args.pop() as ValidatorBlock) : undefined;
    const options = extractOptionsBang(args);
    options.class = this;

    for (const klass of args as ValidatorClass[]) {
      const validator = new klass({ ...options }, block);

      const _validators = hashDup(this._validators);
      const attributes = (validator as { attributes?: readonly string[] }).attributes;
      if (Array.isArray(attributes) && attributes.length > 0) {
        for (const attribute of attributes) {
          const key = String(attribute);
          _validators.set(key, [..._validators.get(key)!, validator]);
        }
      } else {
        _validators.set(null, [..._validators.get(null)!, validator]);
      }
      this._validators = _validators;

      this.validate(validator, options);
    }
  },
};
