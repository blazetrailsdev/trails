import { registerConstant } from "@blazetrails/ruby-compat";
import { Zine } from "./zine.js";

export class StrictZine extends Zine {
  static {
    this.strictLoadingByDefault = true;
  }
}
registerConstant("StrictZine", StrictZine);
