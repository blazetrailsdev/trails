// vendor/rails/activerecord/test/models/uuid_comment.rb
import { Base } from "../../base.js";

export class UuidComment extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
