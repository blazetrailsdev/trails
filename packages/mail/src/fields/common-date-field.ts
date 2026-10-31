import { ArgumentError, DateTime, strftime } from "@blazetrails/date";
import { rbObjAsString, type Encoding } from "@blazetrails/ruby-compat";
import { DateTimeElement } from "../elements/date-time-element.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class CommonDateField extends NamedStructuredField {
  static override isSingular(): boolean {
    return true;
  }

  static normalizeDatetime(string: unknown): unknown {
    let datetime: ReturnType<typeof DateTime.parse> | undefined;
    if (Utilities.isBlank(string)) {
      datetime = DateTime.now();
    } else {
      const stripped = rbObjAsString(string)
        .replace(/\(.*?\)/g, "")
        .replace(/ +/g, " ");
      try {
        datetime = DateTime.parse(stripped);
      } catch (e) {
        if (!(e instanceof ArgumentError)) throw e;
        if ("invalid date" !== e.message) throw e;
      }
    }

    if (datetime != null) {
      return strftime(datetime, "%a, %d %b %Y %H:%M:%S %z");
    } else {
      return string;
    }
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super(new.target.normalizeDatetime(value), charset);
  }

  dateTime(): ReturnType<typeof DateTime.parse> | null {
    try {
      const element = this.element();
      return DateTime.parse(`${element.dateString} ${element.timeString}`);
    } catch (e) {
      if (e instanceof ArgumentError && e.message === "invalid date") return null;
      throw e;
    }
  }

  override default(): unknown {
    return this.dateTime();
  }

  override element(): DateTimeElement {
    return (this._element ??= new DateTimeElement(this.value as string)) as DateTimeElement;
  }

  /** @internal */
  doEncode(): string {
    return `${this.name}: ${this.value}\r\n`;
  }

  /** @internal */
  doDecode(): unknown {
    return rbObjAsString(this.value);
  }
}
