import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class WithoutTable extends Base {
  static {
    this.defaultScope(function (this: any) {
      return this.where({ published: true });
    });
  }
}
registerConstant("WithoutTable", WithoutTable);
