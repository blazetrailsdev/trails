import { Base, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Developer extends Base {
  static {
    this.hasAndBelongsToMany("projects");
    this.hasMany("replies");
    this.hasMany("topics", { through: "replies" });
    this.acceptsNestedAttributesFor("projects");
  }
}
(TopLevel as { Developer?: typeof Developer }).Developer = Developer;
registerModel(Developer);
