import type { Base } from "../base.js";

/**
 * Wraps validation errors from nested associations, providing
 * the inner error and the association that caused it.
 *
 * Mirrors: ActiveRecord::Associations::NestedError
 */
export class NestedError {
  readonly attribute: string;
  readonly innerError: Error;
  readonly record: Base;

  constructor(record: Base, innerError: Error, attribute: string) {
    this.record = record;
    this.innerError = innerError;
    this.attribute = attribute;
  }

  get message(): string {
    return this.innerError.message;
  }
}
