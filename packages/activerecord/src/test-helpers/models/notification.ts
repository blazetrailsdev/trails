import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Notification extends Base {
  declare message: string;

  static {
    this.validates("message", { presence: true });
  }
}
registerConstant("Notification", Notification);
