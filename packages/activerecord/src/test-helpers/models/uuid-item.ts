import { Base } from "../../base.js";

export class UuidItem extends Base {}

export class UuidValidatingItem extends UuidItem {
  static {
    this.validatesUniquenessOf("uuid");
  }
}
