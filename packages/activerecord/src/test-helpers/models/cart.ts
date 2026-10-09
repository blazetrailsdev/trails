import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Cart extends Base {
  declare shop_id: bigint;
  declare title: string;

  static {
    this.primaryKey = "id";
  }
}
registerConstant("Cart", Cart);
