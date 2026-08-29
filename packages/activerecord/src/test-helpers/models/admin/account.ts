import { Base } from "../../../base.js";

export class AdminAccount extends Base {
  static _tableName = "admin_accounts";
  static moduleName = "Admin";
  static _demodulizedName = "Account";

  static {
    this.hasMany("users", { className: "AdminUser" });
  }
}
