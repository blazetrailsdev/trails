import type { Person } from "./person.js";
// vendor/rails/activerecord/test/models/personal_legacy_thing.rb
import { Base } from "../../base.js";

export class PersonalLegacyThing extends Base {
  declare person: Person | null;
  declare loadBelongsTo: (name: "person") => Promise<Person | null>;
  declare person_id: number;
  declare tps_report_number: number;
  declare version: number;

  static {
    this.lockingColumn = "version";
    this.belongsTo("person", { counterCache: true });
  }
}
