import { rbHash } from "@blazetrails/activesupport";
import { NodeExpression } from "./node-expression.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class False extends NodeExpression {
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof False && this.constructor === other.constructor;
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface False extends _AliasPredication {}
