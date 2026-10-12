import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Notification extends Base {
  declare message: string;

  static {
    this.validates("message", { presence: true });
  }
}
registerModel(Notification);
