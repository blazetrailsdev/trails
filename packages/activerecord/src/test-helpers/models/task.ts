import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

export class Task extends Base {
  declare ending: RubyTime | Temporal.PlainDateTime;
  declare starting: RubyTime | Temporal.PlainDateTime;

  get updatedAt() {
    return this.readAttribute("ending");
  }
}
