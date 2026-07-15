/**
 * Temporal types carry a `Temporal.X` `Symbol.toStringTag`. Reading it keeps
 * Temporal checks structural rather than pulling the namespace into arel's
 * runtime imports — arel has no activesupport dependency at runtime.
 *
 * Shared by the visitors so the tag-shape knowledge lives in one place; each
 * caller maps the tag to its own Rails analogue (to-sql dispatches on
 * supported-vs-unsupported, dot labels leaf nodes with a Ruby class name).
 *
 * @internal
 */
export function temporalTag(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const tag = (v as Record<symbol, unknown>)[Symbol.toStringTag];
  return typeof tag === "string" && tag.startsWith("Temporal.") ? tag : null;
}

/** @internal */
export type TemporalClassName = "Date" | "DateTime" | "Time";

/**
 * The Ruby class each Temporal type stands in for. Temporal is this codebase's
 * Time/Date analogue, so these values have a visitable Rails ancestor
 * (`visit_Date` / `visit_DateTime` / `visit_Time`) and dispatch onto it.
 *
 * Deliberately a whitelist, not a `startsWith("Temporal.")` catch-all: the
 * Temporal types absent here (`Duration`, `PlainYearMonth`, `PlainMonthDay`)
 * have NO visitable Rails ancestor — Rails defines no visitor for
 * `ActiveSupport::Duration`, which is a plain `Object` subclass rather than a
 * `Numeric` — so Rails raises on them at visitor.rb:39 and so must we.
 *
 * @internal
 */
const TEMPORAL_CLASS_NAMES: Readonly<Record<string, TemporalClassName>> = {
  "Temporal.PlainDate": "Date",
  "Temporal.PlainDateTime": "DateTime",
  "Temporal.Instant": "Time",
  "Temporal.ZonedDateTime": "Time",
  "Temporal.PlainTime": "Time",
};

/**
 * The Ruby class Rails would dispatch `v` on, or `null` when `v` is not a
 * Temporal value or is one with no Ruby analogue.
 *
 * @internal
 */
export function temporalClassName(v: unknown): TemporalClassName | null {
  const tag = temporalTag(v);
  return tag === null ? null : (TEMPORAL_CLASS_NAMES[tag] ?? null);
}
