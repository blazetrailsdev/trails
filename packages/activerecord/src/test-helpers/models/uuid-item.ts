import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class UuidItem extends Base {}
registerConstant("UuidItem", UuidItem);

export class UuidValidatingItem extends UuidItem {
  static {
    this.validatesUniquenessOf("uuid");
  }
}
registerConstant("UuidValidatingItem", UuidValidatingItem);
