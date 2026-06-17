// vendor/rails/activerecord/test/models/legacy_thing.rb
import { Base } from "../../base.js";

export class LegacyThing extends Base {
  declare tps_report_number: number;
  declare version: number;

  static {
    this.lockingColumn = "version";
  }
}
