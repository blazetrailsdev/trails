/**
 * Predicate mirroring Ruby's `x.is_a?(ActiveRecord::Base)`.
 *
 * `ArrayHandler#call` flattens AR records to their primary key with
 * `x.is_a?(Base) ? x.id : x` — note this is a stricter check than the
 * `respond_to?(:id)` duck-type used by `PredicateBuilder#build`. An arbitrary
 * non-Base object that happens to carry an `id` property is NOT a record and
 * must not be dereferenced here.
 *
 * Detecting a Base instance via the `_isActiveRecordBase` static brand (set on
 * the `Base` constructor and inherited by every model subclass) avoids a
 * circular import: `array-handler.ts` → `base.ts` → `predicate-builder.ts` →
 * `array-handler.ts`. The brand is the same marker used by `core.ts`,
 * `connection-handling.ts`, and `attribute-methods.ts` to recognize AR classes.
 */
export function isBaseInstance(value: unknown): value is { id: unknown } {
  if (value === null || typeof value !== "object") return false;
  const ctor = (value as { constructor?: { _isActiveRecordBase?: unknown } }).constructor;
  return ctor?._isActiveRecordBase === true;
}
