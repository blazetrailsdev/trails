import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Boolean extends Base {
  declare has_fun: boolean;
  declare value: boolean;
}
registerConstant("Boolean", Boolean);
