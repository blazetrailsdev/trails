import { DateTimeParser } from "../parsers/date-time-parser.js";

export class DateTimeElement {
  readonly dateString: string;
  readonly timeString: string;

  constructor(string: string | null) {
    const dateTime = DateTimeParser.parse(string);
    this.dateString = dateTime.dateString;
    this.timeString = dateTime.timeString;
  }
}
