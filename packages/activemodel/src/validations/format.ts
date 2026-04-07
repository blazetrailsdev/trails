import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface FormatOptions extends ConditionalOptions {
  with?: RegExp | ((record: AnyRecord) => RegExp);
  without?: RegExp | ((record: AnyRecord) => RegExp);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class FormatValidator implements Validator {
  constructor(private options: FormatOptions) {}

  private resolveRegexp(opt: RegExp | ((record: AnyRecord) => RegExp), record: AnyRecord): RegExp {
    const re = typeof opt === "function" ? opt(record) : opt;
    if (re.multiline) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), which may present a security risk. Did you mean to use \\A and \\z, or pass the `multiline: true` option?",
      );
    }
    return re;
  }

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (value === null || value === undefined) {
      if (this.options.allowNil) return;
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;
    const str = String(value);
    if (this.options.with) {
      const re = this.resolveRegexp(this.options.with, record);
      if (!re.test(str)) {
        errs.add(attribute, "invalid", { value, message: this.options.message });
      }
    }
    if (this.options.without) {
      const re = this.resolveRegexp(this.options.without, record);
      if (re.test(str)) {
        errs.add(attribute, "invalid", { value, message: this.options.message });
      }
    }
  }

  checkValidityBang(): void {
    if (!this.options.with && !this.options.without) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    if (this.options.with && this.options.without) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    const withOpt = this.options.with;
    if (withOpt && withOpt instanceof RegExp && withOpt.multiline) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), which may present a security risk. Did you mean to use \\A and \\z?",
      );
    }
  }
}
