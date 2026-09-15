import { actsLikeDate, actsLikeTime } from "@blazetrails/date";
import { actsLikeString } from "../string/behavior.js";

export class Object {
  static actsLike(self: unknown, duck: string): boolean {
    switch (duck) {
      case "time":
        return actsLikeTime(self) || respondTo.call(self, "acts_like_time?");
      case "date":
        return actsLikeDate(self) || respondTo.call(self, "acts_like_date?");
      case "string":
        return actsLikeString(self) || respondTo.call(self, "acts_like_string?");
      default:
        return respondTo.call(self, `acts_like_${duck}?`);
    }
  }
}

function respondTo(this: unknown, rubyName: string): boolean {
  if (this == null) return false;
  const tsName = rubyName
    .replace(/\?$/, "")
    .replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  return typeof (this as Record<string, unknown>)[tsName] === "function";
}
