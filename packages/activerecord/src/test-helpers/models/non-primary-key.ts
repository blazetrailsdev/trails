import type { Temporal } from "@blazetrails/activesupport/temporal";
// vendor/rails/activerecord/test/models/non_primary_key.rb
import { Base } from "../../base.js";

export class NonPrimaryKey extends Base {
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
}
