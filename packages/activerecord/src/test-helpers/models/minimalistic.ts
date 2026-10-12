import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Minimalistic extends Base {
  declare expires_at: bigint;
}
registerModel(Minimalistic);
