/** @noRailsEquivalent CONVERGEABLE arel-visitor-class-names-onto-ruby-compat */
import { temporalTag } from "@blazetrails/ruby-compat";

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
  const tag = typeof v === "object" && v !== null ? temporalTag(v) : null;
  return tag === null ? null : (TEMPORAL_CLASS_NAMES[tag] ?? null);
}
