// vendor/rails/activerecord/test/models/cart.rb
import { Base } from "../../base.js";

export class Cart extends Base {
  declare shop_id: bigint;
  declare title: string;

  static _primaryKey = "id";
}
