import type { Person } from "./person.js";
import { Base } from "../../base.js";

export class PersonalLegacyThing extends Base {
  declare person_id: number;
  declare tps_report_number: number;
  declare version: number;

  static {
    this.lockingColumn = "version";
    this.belongsTo("person", { counterCache: true });
  }
}
export interface PersonalLegacyThing {
  get person(): Person | null | Promise<Person | null>;
  set person(value: Person | null);
}
