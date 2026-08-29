import type { Temporal } from "@blazetrails/date";
import { Base } from "../../base.js";

export class NonPrimaryKey extends Base {
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
}
