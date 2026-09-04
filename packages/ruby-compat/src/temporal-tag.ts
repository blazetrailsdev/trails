/**
 * The class test `Date#==` and `Date#<=>` open with — `d_lite_equal`
 * (`vendor/ruby/ext/date/date_core.c:6902`) answers `false`, and `d_lite_cmp`
 * (`vendor/ruby/ext/date/date_core.c:6810`) `nil`, for an operand that is not a
 * date. Ruby reads it off the class; JS reads it off `Symbol.toStringTag`,
 * because a Temporal value's own `equals` coerces its argument instead.
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function temporalTag(value: unknown): string | null {
  const tag = (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag];
  return typeof tag === "string" && tag.startsWith("Temporal.") ? tag : null;
}

/**
 * Ruby compares a Date against a DateTime on the shared `nth`/`jd`/`df`/`sf`
 * seat both carry (`d_lite_cmp`, `vendor/ruby/ext/date/date_core.c:6810`), so
 * `Date.new(2026, 9, 3) == DateTime.new(2026, 9, 3)`. Temporal splits that seat
 * across PlainDate and PlainDateTime, so widening the narrower one restores the
 * comparison Ruby makes.
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function widenPlainDate(value: unknown): unknown {
  const toPlainDateTime = (value as { toPlainDateTime?: unknown }).toPlainDateTime;
  return typeof toPlainDateTime === "function" ? toPlainDateTime.call(value) : value;
}
