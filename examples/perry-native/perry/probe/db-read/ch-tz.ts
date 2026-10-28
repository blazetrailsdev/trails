import { defaultTimezone } from "./ch-root.js";
export class Tz {
  declare _timezone?: string;
  who(): string {
    return "tz:" + defaultTimezone;
  }
}
