import { rbHash } from "@blazetrails/activesupport";
import { NodeExpression } from "./node-expression.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Distinct extends NodeExpression {
  hash(): number {
    return rbHash(this.constructor);
  }

  eql(other: unknown): boolean {
    return other instanceof Distinct && this.constructor === other.constructor;
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Distinct extends _AliasPredication {}
