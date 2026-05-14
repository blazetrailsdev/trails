/**
 * Module-level configuration flags for ActiveRecord.
 *
 * Rails stores these as singleton_class.attr_accessor on the ActiveRecord
 * module itself (active_record.rb:321-322).
 */

/** @internal */
export let indexNestedAttributeErrors = false;

/** @internal */
export function setIndexNestedAttributeErrors(value: boolean): void {
  indexNestedAttributeErrors = value;
}
