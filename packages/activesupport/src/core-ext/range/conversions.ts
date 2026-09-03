import { Temporal } from "@blazetrails/date";

import { Range } from "@blazetrails/ruby-compat/range";
import { toFs as timeToFs } from "../time/conversions.js";
import { toFs as dateToFs } from "../date/conversions.js";

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    toFs(format?: string): string | undefined;
    toFormattedS(format?: string): string | undefined;
  }
}

function toFsDb(value: unknown): string {
  if (value instanceof Temporal.PlainDate) return dateToFs(value, "db");
  // boundary: `time-ext.ts`'s `toFs` — the ported `Time#to_fs` — takes a JS Date.
  if (value instanceof Date) return timeToFs(value, "db");
  // boundary: as above, an Instant is bridged to the Date `toFs` accepts.
  if (value instanceof Temporal.Instant) return timeToFs(new Date(value.epochMilliseconds), "db");
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
