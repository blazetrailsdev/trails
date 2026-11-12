import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ARUnit2Model } from "./arunit2-model.js";

export class Course extends ARUnit2Model {
  declare name: string;
  static {
    this.belongsTo("college");
    this.hasMany("entrants");
  }
}
constSet(TopLevel, "Course", Course);
DescendantsTracker.registerSubclass(ARUnit2Model, Course);
