import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Discount extends Base {
  declare amount: number;
}
registerConstant("Discount", Discount);
