import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static {
    this.primaryKey = "key_number";
  }
}
registerModel(Keyboard);
