import { defaultTimezone } from "./cm-root.js";
export class Tz {
  who(): string {
    return "tz:" + defaultTimezone;
  }
}
