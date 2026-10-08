import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Minimalistic extends Base {
  declare expires_at: bigint;
}
registerConstant("Minimalistic", Minimalistic);
