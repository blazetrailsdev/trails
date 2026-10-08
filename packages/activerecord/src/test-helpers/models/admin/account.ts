import { Admin } from "../admin.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import type { AdminUser } from "./user.js";

export class AdminAccount extends Base {
  static _tableName = "admin_accounts";
  static {
    rbModConstSet(Admin, "Account", this);
  }
  declare users: AssociationProxy<AdminUser>;

  static {
    this.hasMany("users", { className: "Admin::User" });
  }
}
