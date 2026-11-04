import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Employee extends Base {
  static {
    this.tableName = "employees";
    this.belongsTo("manager", { className: "Employee" });
    this.hasMany("reports", { className: "Employee", foreignKey: "manager_id" });
    constSet(TopLevel, this.name, this);
  }
}
