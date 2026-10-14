import { Zine } from "./zine.js";
import { registerModel } from "../../associations.js";

export class StrictZine extends Zine {
  static {
    this.strictLoadingByDefault = true;
  }
}
registerModel(StrictZine);
