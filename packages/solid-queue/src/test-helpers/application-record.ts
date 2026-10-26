import { Base, registerModel } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  static {
    this.primaryAbstractClass();
  }
}
registerModel(ApplicationRecord);
