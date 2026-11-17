import { Base } from "@blazetrails/activerecord";

export class AnimalsRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

await AnimalsRecord.connectsTo({ database: { writing: ":animals" } });
