import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Guid extends Base {
  declare key: string;
}
registerModel(Guid);
