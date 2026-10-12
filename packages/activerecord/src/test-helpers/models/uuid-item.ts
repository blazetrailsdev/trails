import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class UuidItem extends Base {}
registerModel(UuidItem);

export class UuidValidatingItem extends UuidItem {
  static {
    this.validatesUniquenessOf("uuid");
  }
}
registerModel(UuidValidatingItem);
