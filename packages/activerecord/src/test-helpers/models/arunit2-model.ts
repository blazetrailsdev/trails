import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ARUnit2Model extends Base {
  static {
    this.abstractClass = true;
  }
}
registerConstant("ARUnit2Model", ARUnit2Model);
