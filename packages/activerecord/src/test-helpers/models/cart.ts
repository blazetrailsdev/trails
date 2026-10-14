import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Cart extends Base {
  declare shop_id: bigint;
  declare title: string;

  static {
    this.primaryKey = "id";
  }
}
registerModel(Cart);
