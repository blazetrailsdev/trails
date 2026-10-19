import { describe, expect, it } from "vitest";
import { compileJs } from "./emit-js.js";
import { JsParseError, parseScript, type JsNode } from "./js-parser.js";

// @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
const fixtures: Record<string, string> = import.meta.glob(
  "../../actionview/src/test-helpers/fixtures/**/*.tse",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

function find(root: JsNode, type: string, slice: string): JsNode | null {
  return root.breadthFirstSearch((node) => node.type === type && node.slice === slice);
}

describe("parseScript", () => {
  it("parses the compiled output of every template fixture", () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
    for (const [path, source] of Object.entries(fixtures)) {
      for (const async of [false, true]) {
        const { code } = compileJs(source, { async });
        const program = parseScript(code).value;
        expect(program.type, path).toBe("Program");
        expect(program.children[0].type, path).toBe("ExportDeclaration");
      }
    }
  });

  it("parses the body actionview hands Template#spot, with a top-level return and await", () => {
    const body =
      "const context = this; const _ob = context.outputBuffer;\n" +
      "_ob.append(await ( (await yield) ));\nreturn _ob;\n";
    const program = parseScript(body).value;
    expect(program.children.map((n) => n.type)).toEqual([
      "VariableDeclaration",
      "VariableDeclaration",
      "ExpressionStatement",
      "ReturnStatement",
    ]);
  });

  it("spans the failing call node, so a backtrace column maps to it", () => {
    const { code } = compileJs("first line\n<%= user.name.boom() %>\nlast\n");
    const program = parseScript(code).value;
    const call = find(program, "CallExpression", "user.name.boom()");
    expect(call).not.toBeNull();
    expect(call!.location.startLine).toBe(2);
    expect(call!.location.endLine).toBe(2);
    expect(code.split("\n")[1].slice(call!.location.startColumn, call!.location.endColumn)).toBe(
      "user.name.boom()",
    );
  });

  it("covers the expression and statement forms templates use", () => {
    const source = [
      "<% const { a, b = 1, ...rest } = locals %>",
      "<% for (const [i, item] of items.entries()) { %><%= `${i}: ${item?.name ?? '-'}` %><% } %>",
      "<% if (x > 1 && !y) { %>big<% } else if (z) { %>z<% } else { %>small<% } %>",
      "<%= items.map((i) => i * 2).filter(async ({ n }) => n % 2 === 0).join(', ') %>",
      "<%= cache(post, () => { %>body<% }) %>",
      "<%= /a[/]b/i.test(s) ? new Date(0).getTime() : [1, , ...more] %>",
      "<% try { x++ } catch (e) { throw e } finally { done() } %>",
      "<% let n = 0; while (n < 3) n += 1; %><%= typeof n === 'number' %>",
      "<%= { key: 1, [k]: 2, method() { return this.key }, get g() { return 1 } } %>",
    ].join("\n");
    const { code } = compileJs(source, { async: true });
    const program = parseScript(code).value;
    const types = new Set<string>();
    const ids = new Set<number>();
    program.breadthFirstSearch((node) => (types.add(node.type), ids.add(node.nodeId), false));
    expect(ids.size).toBeGreaterThan(types.size);
    for (const type of [
      "ForOfStatement",
      "IfStatement",
      "TemplateLiteral",
      "ArrowFunctionExpression",
      "ConditionalExpression",
      "NewExpression",
      "TryStatement",
      "WhileStatement",
      "ObjectExpression",
      "SpreadElement",
      "AwaitExpression",
      "LogicalExpression",
    ]) {
      expect(types, type).toContain(type);
    }
    expect(find(program, "MemberExpression", "item?.name")).not.toBeNull();
    expect(find(program, "Literal", "/a[/]b/i")).not.toBeNull();
  });

  it("covers switch, do-while, labels and class", () => {
    const source = [
      "<% switch (kind) { case 'a': case 'b': %>ab<% break; default: %>other<% } %>",
      "<% let i = 0; do { i++ } while (i < 3); %>",
      "<% outer: for (const row of rows) { for (const c of row) { if (c) continue outer; break outer; } } %>",
      "<% class Row extends Base.Item { static count = 0; #id; static { Row.count = 1 } get id() { return this.#id } static of(x) { return new Row(x) } } %>",
      "<%= new (class { name = 'anon' })().name %>",
    ].join("\n");
    const { code } = compileJs(source, { async: true });
    const program = parseScript(code).value;
    const types = new Set<string>();
    program.breadthFirstSearch((node) => (types.add(node.type), false));
    for (const type of [
      "SwitchStatement",
      "SwitchCase",
      "DoWhileStatement",
      "LabeledStatement",
      "ClassDeclaration",
      "ClassExpression",
      "ClassBody",
      "StaticBlock",
      "MethodDefinition",
      "PropertyDefinition",
    ]) {
      expect(types, type).toContain(type);
    }
    expect(find(program, "SwitchCase", "case 'a':")).not.toBeNull();
    expect(find(program, "ContinueStatement", "continue outer;")).not.toBeNull();
    expect(find(program, "BreakStatement", "break outer;")).not.toBeNull();
    expect(find(program, "MethodDefinition", "get id() { return this.#id }")).not.toBeNull();
    const afterStatement = parseScript("switch (x) { case 1: f(); default: g() }").value;
    expect(find(afterStatement, "SwitchCase", "default: g()")).not.toBeNull();
    expect(() => parseScript("switch (x) { case 1: f()")).toThrow(JsParseError);
    expect(() => parseScript("class A { m() {}")).toThrow(JsParseError);
  });

  it("raises JsParseError with the offending offset", () => {
    expect(() => parseScript("a(b,;")).toThrow(JsParseError);
    expect(() => parseScript("async\n(x) => x")).toThrow('Unexpected token "=>"');
    expect(parseScript("export const x = 1;").value.children[0].children[0].type).toBe(
      "VariableDeclaration",
    );
    expect(() => parseScript("x = 'open")).toThrow("(at offset 4)");
  });
});
