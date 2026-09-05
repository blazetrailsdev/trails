import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

export class NonPrimaryKey extends Base {
  declare created_at: RubyTime | Temporal.PlainDateTime;
}
