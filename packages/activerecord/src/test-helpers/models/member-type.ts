// vendor/rails/activerecord/test/models/member_type.rb
import { Base } from "../../base.js";

export class MemberType extends Base {
  static {
    this.hasMany("members");
  }
}
