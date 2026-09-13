import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Branch extends Base {
  declare branches: AssociationProxy<Branch>;
  declare branch_id: number;

  static {
    this.hasMany("branches");
    this.belongsTo("branch", { optional: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Branch {
  get branch(): Branch | null | Promise<Branch | null>;
  set branch(value: Branch | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BrokenBranch extends Branch {
  declare branches: AssociationProxy<BrokenBranch>;

  static {
    this.hasMany("branches", { className: "BrokenBranch", foreignKey: "branch_id" });
    this.belongsTo("branch", {
      optional: true,
      inverseOf: "branch",
      className: "BrokenBranch",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BrokenBranch {
  get branch(): BrokenBranch | null | Promise<BrokenBranch | null>;
  set branch(value: BrokenBranch | null);
}
