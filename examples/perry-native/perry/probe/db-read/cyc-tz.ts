// Mirrors type/internal/timezone.ts: imports the package root, exports a class.
import { defaultTimezone } from "./cyc-root.ts";
export class Tz {
  who(): string {
    return "tz:" + defaultTimezone;
  }
}
