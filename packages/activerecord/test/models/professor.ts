import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ARUnit2Model } from "./arunit2-model.js";

export class Professor extends ARUnit2Model {
  static {
    this.hasAndBelongsToMany("courses");
  }
}
constSet(TopLevel, "Professor", Professor);
DescendantsTracker.registerSubclass(ARUnit2Model, Professor);
