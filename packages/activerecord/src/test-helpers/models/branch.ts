import type { AssociationProxy } from "../../associations/collection-proxy.js";
// vendor/rails/activerecord/test/models/branch.rb
import { Base } from "../../base.js";

export class Branch extends Base {
  declare branches: AssociationProxy<Branch>;
  declare branch: Branch | null;
  declare loadBelongsTo: (name: "branch") => Promise<Branch | null>;
  declare branch_id: number;

  static {
    this.hasMany("branches");
    this.belongsTo("branch", { optional: true });
  }
}

export class BrokenBranch extends Branch {
  declare branches: AssociationProxy<BrokenBranch>;
  declare branch: BrokenBranch | null;
  declare loadBelongsTo: (name: "branch") => Promise<BrokenBranch | null>;

  static {
    this.hasMany("branches", { className: "BrokenBranch", foreignKey: "branch_id" });
    this.belongsTo("branch", {
      optional: true,
      inverseOf: "branch",
      className: "BrokenBranch",
    });
  }
}
