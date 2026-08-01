import type ts from "typescript";
import type { Linearization } from "./linearization.js";
export interface PrismNode {
  constructor: {
    name: string;
  };
  compactChildNodes(): PrismNode[];
  [field: string]: unknown;
}
export type ExprHandler = (node: PrismNode, e: Emitter) => ts.Expression | null;
export type StmtHandler = (node: PrismNode, e: Emitter, isLast: boolean) => ts.Statement[] | null;
export function rubyStr(unescaped: unknown): string {
  if (unescaped && typeof unescaped === "object" && "value" in unescaped) {
    return String(
      (
        unescaped as {
          value: unknown;
        }
      ).value,
    );
  }
  return String(unescaped ?? "");
}
export interface Emitter {
  expr(node: PrismNode | null | undefined): ts.Expression;
  stmt(node: PrismNode, isLast: boolean): ts.Statement[];
  stmts(node: PrismNode | null | undefined, implicitReturn: boolean): ts.Statement[];
  readonly coverage: Coverage;
  /**
   * Record a node the handler chose not to translate faithfully. Keeps the
   * enclosing def out of the "clean" set even though a marker was emitted.
   */
  decline(kind: string): void;
  readonly perDef: Map<
    string,
    {
      total: number;
      passthrough: number;
    }
  >;
  currentDef: string;
  /** The Ruby name of the enclosing `def`, before name-convention mapping. */
  currentRubyDef: string;
  /** `::`-joined path of the enclosing `module`/`class`, if any. */
  currentModule: string | null;
  readonly linearization: Linearization | null;
  inClass: boolean;
  inSingleton: boolean;
  readonly asyncMethods: ReadonlySet<string>;
  readonly delegations: ReadonlyMap<string, string>;
  inAsyncMethod: boolean;

  inLoop: boolean;

  readonly helpers: Set<string>;

  blockParamName: string | null;
  readonly declared: Set<string>;
  /**
   * Receivers with locally established async provenance, keyed as
   * `@ivar` / `local`. Scoped to the enclosing def, like `declared`.
   */
  readonly asyncBindings: Set<string>;
}
export interface Coverage {
  record(kind: string, handled: boolean): void;
  readonly counts: Map<
    string,
    {
      handled: number;
      passthrough: number;
    }
  >;
}
