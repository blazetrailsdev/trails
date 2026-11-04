import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Person } from "./person.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PersonalLegacyThing extends Base {
  declare person_id: number;
  declare tps_report_number: number;
  declare version: number;

  static {
    this.lockingColumn = "version";
    this.belongsTo("person", { counterCache: true });
  }
}
constSet(TopLevel, "PersonalLegacyThing", PersonalLegacyThing);
DescendantsTracker.registerSubclass(Base, PersonalLegacyThing);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PersonalLegacyThing {
  get person(): Person | null | Promise<Person | null>;
  set person(value: Person | null);
}
