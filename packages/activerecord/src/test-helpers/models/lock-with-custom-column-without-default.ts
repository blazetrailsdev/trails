import type { Temporal } from "@blazetrails/activesupport/temporal";
// vendor/rails/activerecord/test/cases/locking_test.rb
import { Base } from "../../base.js";

export class LockWithCustomColumnWithoutDefault extends Base {
  declare title: string;
  declare custom_lock_version: number;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this._tableName = "lock_without_defaults_cust";
    this.lockingColumn = "custom_lock_version";
    this.attribute("title", "string");
    this.attribute("custom_lock_version", "integer");
    this.attribute("created_at", "datetime");
    this.attribute("updated_at", "datetime");
  }
}
