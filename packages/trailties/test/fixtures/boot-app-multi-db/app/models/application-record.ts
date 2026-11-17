import { Base } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

await ApplicationRecord.connectsTo({
  database: { writing: ":primary", reading: ":primary_replica" },
});
