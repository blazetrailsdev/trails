import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Discount extends Base {
  declare amount: number;
}
registerModel(Discount);
