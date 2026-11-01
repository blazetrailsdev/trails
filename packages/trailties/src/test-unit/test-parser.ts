import { Range, getFs, type Method } from "@blazetrails/ruby-compat";
import { API } from "typescript/unstable/sync";
import * as ts from "typescript/unstable/ast";

let api: API | undefined;

export class TestParser {
  /** @internal */
  private static beginsToEnds: Record<string, Record<number, number>> = {};

  /** @missingRailsCall parse — PERMANENT */
  static definitionFor(method: Pick<Method, "sourceLocation">): [string, Range<number>] | null {
    const [filepath, startLine] = method.sourceLocation()!;
    this.beginsToEnds[filepath] ??= this.ranges(filepath);
    const endLine = this.beginsToEnds[filepath][startLine];
    if (endLine == null) return null;
    return [filepath, new Range(startLine, endLine)];
  }

  /** @internal */
  static ranges(filepath: string): Record<number, number> {
    api ??= new API();
    const sourceFile = api.createSourceFile(filepath, getFs().readFileSync(filepath, "utf8"));
    const line = (position: number) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
    const queue: ts.Node[] = [sourceFile];
    const beginsToEnds: Record<number, number> = {};
    let node: ts.Node | undefined;
    while ((node = queue.shift())) {
      if (
        ts.isMethodDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isCallExpression(node)
      ) {
        beginsToEnds[line(node.getStart(sourceFile))] = line(node.end);
      }

      node.forEachChild((child) => {
        queue.push(child);
      });
    }
    return beginsToEnds;
  }
}
