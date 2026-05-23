// vendor/rails/activerecord/test/models/uuid_item.rb
import { Base } from "../../base.js";

export class UuidItem extends Base {}

export class UuidValidatingItem extends UuidItem {
  static {
    this.validatesUniqueness("uuid");
  }
}
