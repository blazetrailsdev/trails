import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { Family } from "./family.js";
import type { User } from "./user.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FamilyTree extends Base {
  declare family_id: number;
  declare member_id: number;
  declare token: string;

  static {
    this.belongsTo("member", { className: "User", foreignKey: "member_id" });
    this.belongsTo("family");
  }
}
constSet(TopLevel, "FamilyTree", FamilyTree);
DescendantsTracker.registerSubclass(Base, FamilyTree);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FamilyTree {
  get member(): User | null | Promise<User | null>;
  set member(value: User | null);
  get family(): Family | null | Promise<Family | null>;
  set family(value: Family | null);
}
