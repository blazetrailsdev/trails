import { actsLikeDate, actsLikeTime } from "@blazetrails/date";
import { actsLikeString } from "../string/behavior.js";

export function actsLike(this: unknown, duck: string): boolean {
  switch (duck) {
    case "time":
      return actsLikeTime(this) || respondTo.call(this, "acts_like_time?");
    case "date":
      return actsLikeDate(this) || respondTo.call(this, "acts_like_date?");
    case "string":
      return actsLikeString(this) || respondTo.call(this, "acts_like_string?");
    default:
      return respondTo.call(this, `acts_like_${duck}?`);
  }
}

/** @perf 627ns — PERMANENT */
const _tsNames = new Map<string, string>();

function respondTo(this: unknown, rubyName: string): boolean {
  if (this == null) return false;
  let tsName = _tsNames.get(rubyName);
  if (tsName === undefined) {
    tsName = rubyName.replace(/\?$/, "").replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    _tsNames.set(rubyName, tsName);
  }
  return typeof (this as Record<string, unknown>)[tsName] === "function";
}
