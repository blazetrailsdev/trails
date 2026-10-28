// Mirrors packages/activerecord/src/active-record.ts: the package root that
// the cycle closes through.
import { T } from "./cyc-time.ts";
export const defaultTimezone = "utc";
export const seen = typeof T;
