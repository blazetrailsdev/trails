import { Base } from "../../base.js";

export class PostWithPrefetchedPk extends Base {
  static _tableName = "posts";

  static isPrefetchPrimaryKey(): boolean {
    return true;
  }

  static nextSequenceValue() {
    return 123456;
  }
}
