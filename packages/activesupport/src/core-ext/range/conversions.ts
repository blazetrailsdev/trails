import { Range } from "@blazetrails/ruby-compat/range";
import { rbFSend } from "@blazetrails/ruby-compat";
import "../time/conversions.js";
import "../date/conversions.js";

declare module "@blazetrails/ruby-compat/range" {
  interface Range<T> {
    toFs(format?: string): string | undefined;
    toFormattedS(format?: string): string | undefined;
  }
}

function toFsDb(value: unknown): string {
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return rbFSend(value, "toFs", "db") as string;
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
