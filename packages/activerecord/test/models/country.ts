import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Treaty } from "./treaty.js";
import { Base } from "../../lib/base.js";

export class Country extends Base {
  declare treaties: AssociationProxy<Treaty>;
  declare country_id: string;
  declare name: string;

  static {
    this.hasAndBelongsToMany("treaties");
  }
}
constSet(TopLevel, "Country", Country);
DescendantsTracker.registerSubclass(Base, Country);
