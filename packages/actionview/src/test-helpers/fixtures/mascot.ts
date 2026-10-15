import { Base, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Mascot extends Base {
  static {
    this.belongsTo("company");
  }
}
(TopLevel as { Mascot?: typeof Mascot }).Mascot = Mascot;
registerModel(Mascot);
