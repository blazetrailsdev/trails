import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  static {
    this.primaryAbstractClass();
  }
}
constSet(TopLevel, "ApplicationRecord", ApplicationRecord);
