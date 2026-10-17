import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ApplicationJob extends Base {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ApplicationJob", ApplicationJob);
