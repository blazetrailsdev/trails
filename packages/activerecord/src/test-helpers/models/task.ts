import type { Temporal } from "@blazetrails/activesupport/temporal";
// vendor/rails/activerecord/test/models/task.rb
import { Base } from "../../base.js";

export class Task extends Base {
  declare ending: Temporal.Instant | Temporal.PlainDateTime;
  declare starting: Temporal.Instant | Temporal.PlainDateTime;

  get updatedAt() {
    return this.readAttribute("ending");
  }
}
