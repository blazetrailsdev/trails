import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isExcluded, checkClusivityValidity } from "./clusivity.js";

export class ExclusionValidator extends EachValidator {
  override checkValidity(): void {
    checkClusivityValidity(this.options);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    const inOpt = (this.options.in ?? this.options.within) as
      | Iterable<unknown>
      | (() => Iterable<unknown>)
      | undefined;
    if (!inOpt) return;
    const collection = typeof inOpt === "function" ? inOpt() : inOpt;
    if (isExcluded(collection, value)) {
      record.errors.add(attribute, "exclusion", { value, message: this.options.message });
    }
  }
}
