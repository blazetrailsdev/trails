import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { ARUnit2Model } from "./arunit2-model.js";

export class Professor extends ARUnit2Model {
  static {
    this.hasAndBelongsToMany("courses");
  }
}
constSet(TopLevel, "Professor", Professor);
DescendantsTracker.registerSubclass(ARUnit2Model, Professor);
