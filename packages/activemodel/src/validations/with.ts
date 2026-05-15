import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";

export class WithValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, _value: unknown): void {
    const methodName = this.options.with as string;
    const method = (record as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      throw new globalThis.Error(
        `WithValidator expected ${methodName} to be a function on the record`,
      );
    }
    // Mirrors with.rb:8-12: arity == 0 → call without arg, else with attr.
    // JS divergence: rest-param ((...args) => {}) and default-param ((x = "") => {})
    // functions both have Function.length 0 and are treated as zero-arity; Ruby
    // gives them negative arity and Rails passes the attr. Documented in tests.
    if (method.length === 0) {
      method.call(record);
    } else {
      method.call(record, attribute);
    }
  }

  override checkValidity(): void {
    super.checkValidity();
    const methodName = this.options.with;
    if (typeof methodName !== "string" || methodName.trim().length === 0) {
      throw new globalThis.Error(
        "WithValidator requires the :with option to be a non-blank string",
      );
    }
  }
}
