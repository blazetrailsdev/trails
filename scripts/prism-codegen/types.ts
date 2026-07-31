import type ts from "typescript";
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
  readonly perDef: Map<
    string,
    {
      total: number;
      passthrough: number;
    }
  >;
  currentDef: string;
  inClass: boolean;
  inSingleton: boolean;
  readonly asyncMethods: ReadonlySet<string>;
  inAsyncMethod: boolean;

  inLoop: boolean;
  readonly declared: Set<string>;
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
