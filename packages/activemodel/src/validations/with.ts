import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { ArgumentError, NameError } from "../attribute-assignment.js";

export class WithValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, _value: unknown): void {
    const methodName = this.options.with as string;
    const method = (record as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      // Mirrors Rails with.rb:9 `record.method(method_name)`, which raises
      // NameError (not its NoMethodError subclass) when the record has no
      // such method.
      throw new NameError(`undefined method '${methodName}' for ${String(record)}`);
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
      throw new ArgumentError("WithValidator requires the :with option to be a non-blank string");
    }
  }
}
