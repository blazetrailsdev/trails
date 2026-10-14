import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Boolean extends Base {
  declare has_fun: boolean;
  declare value: boolean;
}
registerModel(Boolean);
