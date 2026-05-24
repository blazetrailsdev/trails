import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Ast } from "../ast.js";
import { Symbol as SymbolNode, Terminal } from "./node.js";

describe("ActionDispatch::Journey::Nodes::Ast", () => {
  it("test_ast_sets_regular_expressions", () => {
    const requirements: Record<string, RegExp> = { name: /(tender|love)/, value: /./ };
    const tree = new Parser().parse("/page/:name/:value");
    const ast = new Ast(tree, true);
    ast.requirements = requirements;
    const nodes = ast.root.grep(SymbolNode);
    expect(nodes.length).toBe(2);
    for (const n of nodes) expect(n.regexp).toBe(requirements[n.toSym()]);
  });

  it("test_sets_memo_for_terminal_nodes", () => {
    const route = { id: "route" };
    const tree = new Parser().parse("/path");
    const ast = new Ast(tree, true);
    ast.route = route;
    for (const n of ast.root.grep(Terminal)) expect(n.memo).toBe(route);
  });

  it("test_contains_glob", () => {
    const ast = new Ast(new Parser().parse("/*glob"), true);
    expect(ast.isGlob()).toBe(true);
  });

  it("test_does_not_contain_glob", () => {
    const ast = new Ast(new Parser().parse("/"), true);
    expect(ast.isGlob()).toBe(false);
  });

  it("test_names", () => {
    const ast = new Ast(new Parser().parse("/:path/:symbol"), true);
    expect(ast.names).toEqual(["path", "symbol"]);
  });

  it("test_path_params", () => {
    const ast = new Ast(new Parser().parse("/:path/:symbol"), true);
    expect(ast.pathParams).toEqual(["path", "symbol"]);
  });

  it("test_wildcard_options_when_formatted", () => {
    const ast = new Ast(new Parser().parse("/*glob"), true);
    expect(String(ast.wildcardOptions["glob"])).toBe("/.+?/s");
  });

  it("test_wildcard_options_when_false", () => {
    const ast = new Ast(new Parser().parse("/*glob"), false);
    expect(ast.wildcardOptions["glob"]).toBeUndefined();
  });

  it("test_wildcard_options_when_nil", () => {
    const ast = new Ast(new Parser().parse("/*glob"), null);
    expect(String(ast.wildcardOptions["glob"])).toBe("/.+?/s");
  });
});
