import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Node } from "./node.js";
import { Base } from "../../lib/base.js";

export class Tree extends Base {
  declare nodes: AssociationProxy<Node>;
  declare name: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.hasMany("nodes", { dependent: "destroy" });
  }
}
constSet(TopLevel, "Tree", Tree);
DescendantsTracker.registerSubclass(Base, Tree);
