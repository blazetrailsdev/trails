// vendor/rails/activerecord/test/models/legacy_thing.rb
import { Base } from "../../base.js";

export class LegacyThing extends Base {
  static {
    this.lockingColumn = "version";
  }
}
