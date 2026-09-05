import { extractOptionsBang } from "@blazetrails/activesupport";

import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { ArgumentError, NameError } from "../attribute-assignment.js";

export class WithValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attr: string, _val: unknown): void {
    const methodName = this.options.with as string;
    const method = (record as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      throw new NameError(`undefined method '${methodName}' for ${String(record)}`);
    }
    if (method.length === 0) {
      method.call(record);
    } else {
      method.call(record, attr);
    }
  }

  override checkValidityBang(): void {
    super.checkValidityBang();
    const methodName = this.options.with;
    if (typeof methodName !== "string" || methodName.trim().length === 0) {
      throw new ArgumentError("WithValidator requires the :with option to be a non-blank string");
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
  _validators: Map<string | null, ValidatorLike[]>;
  validate(
    filter: ValidatorLike | ((record: ValidatableRecord) => unknown),
    options?: Record<string, unknown>,
  ): void;
}

export async function validatesWith(this: ValidatableRecord, ...args: unknown[]): Promise<void> {
  const [klasses, options] = extractOptionsBang(args);
  options.class = this.constructor;

  for (const klass of klasses as ValidatorClass[]) {
    const validator = new klass({ ...options });
    await validator.validate(this);
  }
}

export const ClassMethods = {
  validatesWith(this: ValidatesWithClassHost, ...args: unknown[]): void {
    const last = args[args.length - 1];
    const block =
      args.length > 1 &&
      typeof last === "function" &&
      !/^class[\s{]/.test(Function.prototype.toString.call(last))
        ? (args.pop() as ValidatorBlock)
        : undefined;
    const [klasses, options] = extractOptionsBang(args);
    options.class = this;

    for (const klass of klasses as ValidatorClass[]) {
      const validator = new klass({ ...options }, block);

      const _validators = new Map(this._validators);
      const attributes = (validator as { attributes?: readonly string[] }).attributes;
      if (Array.isArray(attributes) && attributes.length > 0) {
        for (const attribute of attributes) {
          const key = String(attribute);
          _validators.set(key, [...(_validators.get(key) ?? []), validator]);
        }
      } else {
        _validators.set(null, [...(_validators.get(null) ?? []), validator]);
      }
      this._validators = _validators;

      this.validate(validator, options);
    }
  },
};
