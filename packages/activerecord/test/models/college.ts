import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Student } from "./student.js";
import { ARUnit2Model } from "./arunit2-model.js";

export class College extends ARUnit2Model {
  declare name: string;
  declare students: AssociationProxy<Student>;
  static {
    this.hasMany("courses");
    this.hasMany(
      "students",
      function () {
        return this.where({ active: true });
      },
      { dependent: "destroy" },
    );
  }
}
constSet(TopLevel, "College", College);
DescendantsTracker.registerSubclass(ARUnit2Model, College);
