import { Base, type Relation, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Reply extends Base {
  static {
    this.scope("base", function (this: Relation<Base>) {
      return this.all();
    });
    this.belongsTo("topic", function (this: Relation<Base>) {
      return this.includes("replies");
    });
    this.belongsTo("developer");

    this.validatesPresenceOf("content");
  }
}
(TopLevel as { Reply?: typeof Reply }).Reply = Reply;
registerModel(Reply);
