import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Guid extends Base {
  declare key: string;
}
registerConstant("Guid", Guid);
