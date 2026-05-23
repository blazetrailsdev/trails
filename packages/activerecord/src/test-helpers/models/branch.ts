// vendor/rails/activerecord/test/models/branch.rb
import { Base } from "../../base.js";

export class Branch extends Base {
  static {
    this.hasMany("branches");
    this.belongsTo("branch", { optional: true });
  }
}

export class BrokenBranch extends Branch {
  static {
    this.hasMany("branches", { className: "BrokenBranch", foreignKey: "branch_id" });
    this.belongsTo("branch", {
      optional: true,
      inverseOf: "branch",
      className: "BrokenBranch",
    });
  }
}
