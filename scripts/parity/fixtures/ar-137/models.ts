import { Base, registerModel } from "@blazetrails/activerecord";

export class Employee extends Base {
  static {
    this.tableName = "employees";
    this.belongsTo("manager", { className: "Employee" });
    this.hasMany("reports", { className: "Employee", foreignKey: "manager_id" });
    registerModel(this);
  }
}
