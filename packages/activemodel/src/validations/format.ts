import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";

export class FormatValidator extends EachValidator {
  private resolveRegexp(opt: RegExp | ((record: AnyRecord) => RegExp), record: AnyRecord): RegExp {
    const re = typeof opt === "function" ? opt(record) : opt;
    if (re.multiline) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), which may present a security risk. Did you mean to use \\A and \\z, or pass the `multiline: true` option?",
      );
    }
    return re;
  }

  override checkValidity(): void {
    const withOpt = this.options.with;
    const withoutOpt = this.options.without;
    if (!withOpt && !withoutOpt) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    if (withOpt && withoutOpt) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    if (withOpt && withOpt instanceof RegExp && withOpt.multiline) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), which may present a security risk. Did you mean to use \\A and \\z?",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (value === null || value === undefined) return;
    const str = String(value);
    if (this.options.with) {
      const re = this.resolveRegexp(
        this.options.with as RegExp | ((record: AnyRecord) => RegExp),
        record,
      );
      if (!re.test(str)) {
        record.errors.add(attribute, "invalid", { value, message: this.options.message });
      }
    }
    if (this.options.without) {
      const re = this.resolveRegexp(
        this.options.without as RegExp | ((record: AnyRecord) => RegExp),
        record,
      );
      if (re.test(str)) {
        record.errors.add(attribute, "invalid", { value, message: this.options.message });
      }
    }
  }
}
