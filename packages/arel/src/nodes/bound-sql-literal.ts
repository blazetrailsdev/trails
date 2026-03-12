import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { Quoted } from "./quoted.js";

/**
 * BoundSqlLiteral — a SQL literal with bind parameters.
 *
 * Supports positional (`?`) and named (`:name`) placeholders.
 *
 * Mirrors: Arel::Nodes::BoundSqlLiteral
 */
export class BoundSqlLiteral extends Node {
  readonly sql: string;
  readonly positionalBinds: unknown[];
  readonly namedBinds: Record<string, unknown>;

  constructor(
    sql: string,
    positionalBinds: unknown[] = [],
    namedBinds: Record<string, unknown> = {},
  ) {
    super();
    this.sql = sql;
    this.positionalBinds = positionalBinds;
    this.namedBinds = namedBinds;
    this.validate();
  }

  private validate(): void {
    const hasPositionalPlaceholders = this.sql.includes("?");
    const namedMatches = this.sql.match(/:[a-zA-Z]\w*/g) || [];
    const hasNamedPlaceholders = namedMatches.length > 0;
    const hasPositionalBinds = this.positionalBinds.length > 0;
    const hasNamedBinds = Object.keys(this.namedBinds).length > 0;

    // Cannot mix positional and named in the SQL itself
    if (hasPositionalPlaceholders && hasNamedPlaceholders) {
      throw new Error("Cannot mix positional and named bind parameters");
    }

    // Cannot provide named binds with positional placeholders or vice versa
    if (hasPositionalPlaceholders && hasNamedBinds) {
      throw new Error("Cannot mix positional and named bind parameters");
    }

    if (hasNamedPlaceholders && hasPositionalBinds) {
      throw new Error("Cannot mix positional and named bind parameters");
    }
  }

  /**
   * Get the parts of the SQL split by bind placeholders,
   * paired with their bound values as Node objects.
   */
  get parts(): Node[] {
    const result: Node[] = [];
    const hasPositional = this.positionalBinds.length > 0;

    if (hasPositional) {
      // Positional binds
      const segments = this.sql.split("?");
      const count = segments.length - 1;
      if (this.positionalBinds.length !== count) {
        throw new Error(
          `Wrong number of bind variables (${this.positionalBinds.length} for ${count})`,
        );
      }
      for (let i = 0; i < segments.length; i++) {
        if (segments[i]) {
          result.push(new SqlLiteral(segments[i]));
        }
        if (i < this.positionalBinds.length) {
          const val = this.positionalBinds[i];
          if (val instanceof Node) {
            result.push(val);
          } else {
            result.push(new Quoted(val));
          }
        }
      }
    } else if (Object.keys(this.namedBinds).length > 0) {
      // Named binds
      const namedPattern = /:[a-zA-Z]\w*/g;
      const requiredNames = new Set<string>();
      let match;
      while ((match = namedPattern.exec(this.sql)) !== null) {
        requiredNames.add(match[0].slice(1));
      }

      // Check all required names are supplied
      for (const name of requiredNames) {
        if (!(name in this.namedBinds)) {
          throw new Error(`Missing named bind parameter: :${name}`);
        }
      }

      let lastIndex = 0;
      const pattern = /:[a-zA-Z]\w*/g;
      while ((match = pattern.exec(this.sql)) !== null) {
        if (match.index > lastIndex) {
          result.push(new SqlLiteral(this.sql.slice(lastIndex, match.index)));
        }
        const name = match[0].slice(1);
        const val = this.namedBinds[name];
        if (val instanceof Node) {
          result.push(val);
        } else {
          result.push(new Quoted(val));
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < this.sql.length) {
        result.push(new SqlLiteral(this.sql.slice(lastIndex)));
      }
    } else {
      result.push(new SqlLiteral(this.sql));
    }

    return result;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
