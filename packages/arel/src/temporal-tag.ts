/** @noRailsEquivalent PERMANENT */

export function temporalTag(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const tag = (v as Record<symbol, unknown>)[Symbol.toStringTag];
  return typeof tag === "string" && tag.startsWith("Temporal.") ? tag : null;
}

/** @internal */
export type TemporalClassName = "Date" | "DateTime" | "Time";

/** @internal */
const TEMPORAL_CLASS_NAMES: Readonly<Record<string, TemporalClassName>> = {
  "Temporal.PlainDate": "Date",
  "Temporal.PlainDateTime": "DateTime",
  "Temporal.Instant": "Time",
  "Temporal.ZonedDateTime": "Time",
  "Temporal.PlainTime": "Time",
};

export function temporalClassName(v: unknown): TemporalClassName | null {
  const tag = temporalTag(v);
  return tag === null ? null : (TEMPORAL_CLASS_NAMES[tag] ?? null);
}
