import { strftime } from "@blazetrails/date";
import { ReceivedElement } from "../elements/received-element.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class ReceivedField extends NamedStructuredField {
  static readonly NAME = "Received";

  /** @internal */
  declare protected _datetime: ReceivedElement["dateTime"];

  override element(): ReceivedElement {
    return (this._element ??= new ReceivedElement(this.value as string)) as ReceivedElement;
  }

  dateTime(): ReceivedElement["dateTime"] {
    return (this._datetime ??= this.element().dateTime);
  }

  info(): string | null {
    return this.element().info;
  }

  formattedDate(): string | null {
    const dateTime = this.dateTime();
    if (dateTime != null) {
      return (
        strftime(dateTime, "%a, %d %b %Y %H:%M:%S ") + strftime(dateTime, "%:z").replaceAll(":", "")
      );
    }
    return null;
  }

  /** @internal */
  doEncode(): string {
    if (Utilities.isBlank(this.value)) {
      return `${this.name}: \r\n`;
    } else {
      return `${this.name}: ${this.info()}; ${this.formattedDate()}\r\n`;
    }
  }

  /** @internal */
  doDecode(): string {
    if (Utilities.isBlank(this.value)) {
      return "";
    } else {
      return `${this.info()}; ${this.formattedDate()}`;
    }
  }
}
