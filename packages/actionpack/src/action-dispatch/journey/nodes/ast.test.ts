import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Ast } from "../ast.js";
import { Symbol as SymbolNode, Terminal } from "./node.js";

describe("ActionDispatch::Journey::Nodes::Ast", () => {
  it("ast sets regular expressions", () => {
    const requirements: Record<string, RegExp> = { name: /(tender|love)/, value: /./ };
    const tree = new Parser().parse("/page/:name/:value");
    const ast = new Ast(tree, true);
    ast.requirements = requirements;
    const nodes = ast.root.grep(SymbolNode);
    expect(nodes.length).toBe(2);
    for (const n of nodes) expect(n.regexp).toBe(requirements[n.toSym()]);
  });

  it("sets memo for terminal nodes", () => {
    const route = { id: "route" };
    const tree = new Parser().parse("/path");
    const ast = new Ast(tree, true);
    ast.route = route;
    for (const n of ast.root.grep(Terminal)) expect(n.memo).toBe(route);
  });

  it("contains glob", () => {
    const ast = new Ast(new Parser().parse("/*glob"), true);
    expect(ast.isGlob()).toBe(true);
  });

  it("does not contain glob", () => {
    const ast = new Ast(new Parser().parse("/"), true);
    expect(ast.isGlob()).toBe(false);
  });

  it("names", () => {
    const ast = new Ast(new Parser().parse("/:path/:symbol"), true);
    expect(ast.names).toEqual(["path", "symbol"]);
  });

  it("path params", () => {
    const ast = new Ast(new Parser().parse("/:path/:symbol"), true);
    expect(ast.pathParams).toEqual(["path", "symbol"]);
  });

  it("wildcard options when formatted", () => {
    const ast = new Ast(new Parser().parse("/*glob"), true);
    expect(String(ast.wildcardOptions["glob"])).toBe("/.+?/s");
  });

  it("wildcard options when false", () => {
    const ast = new Ast(new Parser().parse("/*glob"), false);
    expect(ast.wildcardOptions["glob"]).toBeUndefined();
  });

  it("wildcard options when nil", () => {
    const ast = new Ast(new Parser().parse("/*glob"), null);
    expect(String(ast.wildcardOptions["glob"])).toBe("/.+?/s");
  });
});
