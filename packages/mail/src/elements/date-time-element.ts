import { DateTimeParser } from "../parsers/date-time-parser.js";

export class DateTimeElement {
  dateString: string;
  timeString: string;

  constructor(string: string | null) {
    const dateTime = DateTimeParser.parse(string);
    this.dateString = dateTime.dateString;
    this.timeString = dateTime.timeString;
  }
}
