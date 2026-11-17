import { Base } from "@blazetrails/activerecord";

export class AnimalsRecord extends Base {
  static {
    this.abstractClass = true;
    this.connectsTo({ database: { writing: ":animals" } });
  }
}
