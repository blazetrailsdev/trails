import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { ARUnit2Model } from "./arunit2-model.js";

export class OtherDog extends ARUnit2Model {
  static {
    this._tableName = "dogs";
  }
}
constSet(TopLevel, "OtherDog", OtherDog);
DescendantsTracker.registerSubclass(ARUnit2Model, OtherDog);
