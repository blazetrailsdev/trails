import { DateTime, strftime } from "@blazetrails/date";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { EnvelopeFromParser } from "../parsers/envelope-from-parser.js";

export class EnvelopeFromElement {
  dateTime: ReturnType<typeof DateTime.parse> | null = null;
  address: string;

  constructor(string: string | null) {
    const envelopeFrom = EnvelopeFromParser.parse(string);
    this.address = envelopeFrom.address;
    if (envelopeFrom.ctimeDate != null) this.dateTime = DateTime.parse(envelopeFrom.ctimeDate);
  }

  formattedDateTime(): string | null {
    if (this.dateTime != null) {
      if (rbObjRespondTo(this.dateTime, "ctime")) {
        return (this.dateTime as unknown as { ctime(): string }).ctime();
      } else {
        return strftime(this.dateTime, "%a %b %e %T %Y");
      }
    }
    return null;
  }

  toString(): string {
    if (this.dateTime != null) {
      return `${this.address} ${this.formattedDateTime()}`;
    } else {
      return this.address;
    }
  }
}
