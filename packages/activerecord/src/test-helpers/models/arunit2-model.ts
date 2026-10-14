import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class ARUnit2Model extends Base {
  static {
    this.abstractClass = true;
  }
}
registerModel(ARUnit2Model);
