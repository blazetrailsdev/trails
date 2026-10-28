import { defaultTimezone } from "./cj-root.js";
export class Tz {
  who(): string {
    return "tz:" + defaultTimezone;
  }
}
