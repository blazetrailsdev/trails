import { Base } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  static {
    this.abstractClass = true;
    this.connectsTo({ database: { writing: ":primary", reading: ":primary_replica" } });
  }
}
