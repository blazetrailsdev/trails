import { ArgumentError, rbEqual, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { BindError } from "../errors.js";
import { Fragments } from "./fragments.js";

export class BoundSqlLiteral extends NodeExpression {
  readonly sqlWithPlaceholders: string;
  readonly positionalBinds: unknown[] | null;
  readonly namedBinds: Record<string, unknown> | null;

  /** @missingRailsCall uniq — PERMANENT */
  constructor(
    sqlWithPlaceholders: string,
    positionalBinds: unknown[] | null,
    namedBinds: Record<string, unknown> | null,
  ) {
    super();
    const hasPositional = !(positionalBinds == null || positionalBinds.length === 0);
    const hasNamed = !(namedBinds == null || Object.keys(namedBinds).length === 0);

    if (hasPositional) {
      if (hasNamed) {
        throw new BindError(`cannot mix positional and named binds`, sqlWithPlaceholders);
      }
      const expected = (sqlWithPlaceholders.match(/\?/g) ?? []).length;
      if (positionalBinds.length !== expected) {
        throw new BindError(
          `wrong number of bind variables (${positionalBinds.length} for ${expected})`,
          sqlWithPlaceholders,
        );
      }
    } else if (hasNamed) {
      const tokensInString = [
        ...new Set([...sqlWithPlaceholders.matchAll(/:(?<!::)([a-zA-Z]\w*)/g)].map((m) => m[1])),
      ];
      const missing = tokensInString.filter((t) => !(t in namedBinds));
      if (missing.length > 0) {
        if (missing.length === 1) {
          throw new BindError(`missing value for :${missing[0]}`, sqlWithPlaceholders);
        } else {
          throw new BindError(`missing values for ${JSON.stringify(missing)}`, sqlWithPlaceholders);
        }
      }
    }

    this.sqlWithPlaceholders = sqlWithPlaceholders;
    if (hasPositional) {
      this.positionalBinds = positionalBinds;
      this.namedBinds = null;
    } else {
      this.positionalBinds = null;
      this.namedBinds = namedBinds;
    }
  }

  hash(): number {
    return rbHash([
      this.constructor,
      this.sqlWithPlaceholders,
      this.positionalBinds,
      this.namedBinds,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof BoundSqlLiteral &&
      this.constructor === other.constructor &&
      rbEqual(this.sqlWithPlaceholders, other.sqlWithPlaceholders) &&
      rbEqual(this.positionalBinds, other.positionalBinds) &&
      rbEqual(this.namedBinds, other.namedBinds)
    );
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([this, other as Node]);
  }
}
