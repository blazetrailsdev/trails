import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Branch extends Base {
  declare branches: AssociationProxy<Branch>;
  declare branch_id: number;

  static {
    this.hasMany("branches");
    this.belongsTo("branch", { optional: true });
  }
}
constSet(TopLevel, "Branch", Branch);
DescendantsTracker.registerSubclass(Base, Branch);
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
constSet(TopLevel, "BrokenBranch", BrokenBranch);
DescendantsTracker.registerSubclass(Branch, BrokenBranch);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BrokenBranch {
  get branch(): BrokenBranch | null | Promise<BrokenBranch | null>;
  set branch(value: BrokenBranch | null);
}
