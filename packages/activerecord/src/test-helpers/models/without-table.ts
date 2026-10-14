import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class WithoutTable extends Base {
  static {
    this.defaultScope(function (this: any) {
      return this.where({ published: true });
    });
  }
}
registerModel(WithoutTable);
