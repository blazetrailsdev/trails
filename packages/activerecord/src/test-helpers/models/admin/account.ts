import { Base } from "../../../base.js";
import type { AssociationProxy } from "../../../associations/collection-proxy.js";
import type { AdminUser } from "./user.js";

export class AdminAccount extends Base {
  static _tableName = "admin_accounts";
  static moduleName = "Admin";
  static _demodulizedName = "Account";
  declare users: AssociationProxy<AdminUser>;

  static {
    this.hasMany("users", { className: "AdminUser" });
  }
}
