import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Country } from "./country.js";
import { Base } from "../../lib/base.js";

export class Treaty extends Base {
  declare countries: AssociationProxy<Country>;
  declare name: string;
  declare treaty_id: string;

  static {
    this.hasAndBelongsToMany("countries");
  }
}
constSet(TopLevel, "Treaty", Treaty);
DescendantsTracker.registerSubclass(Base, Treaty);
