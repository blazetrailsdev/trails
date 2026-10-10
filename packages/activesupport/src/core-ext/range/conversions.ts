import { Temporal } from "@blazetrails/date";

import { Range } from "@blazetrails/ruby-compat/range";
import { rbFSend } from "@blazetrails/ruby-compat";
import "../time/conversions.js";
import { toFs as dateToFs } from "../date/conversions.js";

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    toFs(format?: string): string | undefined;
    toFormattedS(format?: string): string | undefined;
  }
}

function toFsDb(value: unknown): string {
  if (value instanceof Temporal.PlainDate) return dateToFs(value, "db");
  // boundary: a JS `Date` a caller still holds is the instant this bridges
  if (value instanceof Date) value = Temporal.Instant.fromEpochMilliseconds(value.getTime());
  if (value instanceof Temporal.Instant) return rbFSend(value, "toFs", "db") as string;
  return String(value);
}

export const RANGE_FORMATS: Record<string, (start: unknown, stop: unknown) => string | undefined> =
  {
    db: (start, stop) => {
      if (start != null && stop != null) {
        if (typeof start === "string") return `BETWEEN '${start}' AND '${stop}'`;
        return `BETWEEN '${toFsDb(start)}' AND '${toFsDb(stop)}'`;
      } else if (start != null) {
        if (typeof start === "string") return `>= '${start}'`;
        return `>= '${toFsDb(start)}'`;
      } else if (stop != null) {
        if (typeof stop === "string") return `<= '${stop}'`;
        return `<= '${toFsDb(stop)}'`;
      }
      return undefined;
    },
  };

export function toFs<T>(this: Range<T>, format: string = "default"): string | undefined {
  const formatter = RANGE_FORMATS[format];
  if (formatter) {
    return formatter(this.begin, this.end);
  } else {
    return this.toS();
  }
}

export const toFormattedS = toFs;

Object.assign(Range.prototype, { toFs, toFormattedS });
