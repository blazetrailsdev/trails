import { Base, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Topic extends Base {
  static {
    this.hasMany("replies", { dependent: "destroy" });
  }
}
(TopLevel as { Topic?: typeof Topic }).Topic = Topic;
registerModel(Topic);
