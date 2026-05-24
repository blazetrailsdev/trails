// vendor/rails/activerecord/test/models/personal_legacy_thing.rb
import { Base } from "../../base.js";

export class PersonalLegacyThing extends Base {
  static {
    this.lockingColumn = "version";
    this.belongsTo("person", { counterCache: true });
  }
}
