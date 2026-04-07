import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";
import { isMember, checkClusivityValidity } from "./clusivity.js";

export interface InclusionOptions extends ConditionalOptions {
  in?: Iterable<unknown> | (() => Iterable<unknown>);
  within?: Iterable<unknown> | (() => Iterable<unknown>);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class InclusionValidator implements Validator {
  constructor(private options: InclusionOptions) {}

  checkValidityBang(): void {
    checkClusivityValidity(this.options);
  }

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const inOpt = this.options.in ?? this.options.within;
    if (!inOpt) return;
    const collection = typeof inOpt === "function" ? inOpt() : inOpt;
    if (!isMember(collection, value)) {
      errs.add(attribute, "inclusion", { value, message: this.options.message });
    }
  }
}
