import { Range, getFs, rbFRequire, rbRequireLoaded, type Method } from "@blazetrails/ruby-compat";
import type * as Ast from "typescript/unstable/ast";
import type * as Sync from "typescript/unstable/sync";

const PARSER_FEATURES = ["typescript/unstable/ast", "typescript/unstable/sync"] as const;

let ts: typeof Ast;
let api: Sync.API | undefined;

/** @noRailsEquivalent PERMANENT */
function renderedTitles(node: Ast.CallExpression, title: string): string[] | null {
  if (title === "") return null;
  const table = node.expression;
  const isEach = (expression: Ast.Node) =>
    ts.isPropertyAccessExpression(expression) && expression.name.text === "each";
  const tagged = ts.isTaggedTemplateExpression(table) && isEach(table.tag);
  const called = ts.isCallExpression(table) && isEach(table.expression);
  if (!tagged && !called) return [title];
  if (!/[%$]/.test(title)) return [title];
  const rows = called ? table.arguments[0] : undefined;
  if (rows == null || !ts.isArrayLiteralExpression(rows) || title.includes("$")) return null;

  const titles: string[] = [];
  for (const row of rows.elements) {
    const args = ts.isArrayLiteralExpression(row) ? [...row.elements] : [row];
    let index = 0;
    let rendered = "";
    let last = 0;
    for (const match of title.matchAll(/%(.?)/g)) {
      rendered += title.slice(last, match.index);
      last = match.index + match[0].length;
      if (match[1] === "%") {
        rendered += "%";
        continue;
      }
      const arg = args[index++];
      if (
        match[1] === "s" &&
        arg != null &&
        (ts.isStringLiteral(arg) ||
          (ts.isNumericLiteral(arg) && String(Number(arg.text)) === arg.text))
      ) {
        rendered += arg.text;
      } else if (
        match[1] === "d" &&
        arg != null &&
        ts.isNumericLiteral(arg) &&
        String(Number(arg.text)) === arg.text
      ) {
        rendered += arg.text;
      } else {
        return null;
      }
    }
    titles.push(rendered + title.slice(last));
  }
  return titles;
}

export class TestParser {
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static async requireParser(): Promise<void> {
    for (const feature of PARSER_FEATURES)
      await rbFRequire({ [feature]: () => import(feature) }, feature);
    ts = rbRequireLoaded("typescript/unstable/ast") as unknown as typeof Ast;
  }

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
    api ??= new (rbRequireLoaded("typescript/unstable/sync") as unknown as typeof Sync).API();
    const sourceFile = api.createSourceFile(filepath, getFs().readFileSync(filepath, "utf8"));
    const line = (position: number) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
    const queue: Ast.Node[] = [sourceFile];
    const beginsToEnds: Record<number, number> = {};
    let node: Ast.Node | undefined;
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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static calls(filepath: string): [number, number, string][] {
    api ??= new (rbRequireLoaded("typescript/unstable/sync") as unknown as typeof Sync).API();
    const sourceFile = api.createSourceFile(filepath, getFs().readFileSync(filepath, "utf8"));
    const line = (position: number) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
    const calls: [number, number, string][] = [];
    const visit = (node: Ast.Node, names: (string | null)[], isCallee: boolean): void => {
      let scope = names;
      if (ts.isCallExpression(node) && !isCallee) {
        let callee: Ast.Node = node.expression;
        while (
          ts.isCallExpression(callee) ||
          ts.isPropertyAccessExpression(callee) ||
          ts.isTaggedTemplateExpression(callee)
        ) {
          callee = ts.isTaggedTemplateExpression(callee) ? callee.tag : callee.expression;
        }
        const argument = node.arguments[0];
        const title =
          argument != null &&
          (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
            ? argument.text
            : "";
        if (ts.isIdentifier(callee) && callee.text === "describe") {
          const titles = renderedTitles(node, title);
          scope = [...names, titles?.length === 1 ? titles[0] : null];
        } else if (
          ts.isIdentifier(callee) &&
          (callee.text === "it" || callee.text === "test") &&
          argument != null &&
          !(
            ts.isPropertyAccessExpression(node.expression) &&
            ["each", "extend"].includes(node.expression.name.text)
          )
        ) {
          for (const rendered of renderedTitles(node, title) ?? [""]) {
            calls.push([
              line(node.getStart(sourceFile)),
              line(node.end),
              names.includes(null) ? "" : [...names, rendered].join(" "),
            ]);
          }
        }
      }
      const inner = ts.isTaggedTemplateExpression(node)
        ? node.tag
        : ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)
          ? node.expression
          : undefined;
      node.forEachChild((child) => {
        visit(child, scope, child === inner);
      });
    };
    visit(sourceFile, [], false);
    return calls;
  }
}
