import { Date as RubyDate } from "@blazetrails/date";
import { SimpleDecoder } from "../simple-decoder.js";
import { PG } from "../namespaces.js";

export class Date extends SimpleDecoder {
  decode(string: string, _tuple: number | null = null, _field: number | null = null): unknown {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(string);
    if (m) {
      return new RubyDate(Number(m[1]), Number(m[2]), Number(m[3]));
    } else {
      return string;
    }
  }
}

PG.TextDecoder.Date = Date;
