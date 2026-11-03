import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class ApplicationRecord extends Base {
  static {
    this.primaryAbstractClass();
  }
}
constSet(TopLevel, "ApplicationRecord", ApplicationRecord);
