import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";

export class WithValidator extends EachValidator {
  override checkValidity(): void {
    super.checkValidity();
    const methodName = this.options.with;
    if (typeof methodName !== "string" || methodName.trim().length === 0) {
      throw new globalThis.Error(
        "WithValidator requires the :with option to be a non-blank string",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, _value: unknown): void {
    const methodName = this.options.with as string;
    const method = record[methodName];
    if (typeof method !== "function") {
      throw new globalThis.Error(
        `WithValidator expected ${methodName} to be a function on the record`,
      );
    }
    method.call(record, attribute);
  }
}
