import type { Temporal } from "@blazetrails/date";
import { Base } from "../../base.js";

export class Task extends Base {
  declare ending: Temporal.Instant | Temporal.PlainDateTime;
  declare starting: Temporal.Instant | Temporal.PlainDateTime;

  get updatedAt() {
    return this.readAttribute("ending");
  }
}
