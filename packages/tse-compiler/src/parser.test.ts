import { describe, it, expect } from "vitest";
import { parse } from "./parser.js";
import { TseSyntaxError } from "./lexer.js";

describe("parse", () => {
  it("lifts locals: and types: magic comments off the node stream", () => {
    const ast = parse(
      "<%# locals: (name:, count: 0) %><%! types: { name: string } !%>hi<%= name %>",
    );
    expect(ast.localsSignature).toBe("name:, count: 0");
    expect(ast.typesAnnotation).toBe("{ name: string }");
    expect(ast.nodes).toEqual([
      { kind: "text", value: "hi", srcLine: 0 },
      { kind: "expr", value: "name", srcLine: 0 },
    ]);
  });

  it("normalizes empty `locals: ()` to `**nil` and keeps the first directive on duplicates", () => {
    expect(parse("<%# locals: () %>").localsSignature).toBe("**nil");
    expect(parse("<%# locals: (a:) %><%# locals: (b:) %>").localsSignature).toBe("a:");
  });

  it("lifts format: magic block onto the AST root", () => {
    const ast = parse('<%! format: "json" !%>Hello');
    expect(ast.formatAnnotation).toBe("json");
    expect(ast.nodes).toEqual([{ kind: "text", value: "Hello", srcLine: 0 }]);
  });

  it("keeps first format: directive on duplicates", () => {
    expect(parse('<%! format: "json" !%><%! format: "xml" !%>').formatAnnotation).toBe("json");
  });

  it("format: and types: can coexist", () => {
    const ast = parse('<%! format: "json" !%><%! types: { name: string } !%>');
    expect(ast.formatAnnotation).toBe("json");
    expect(ast.typesAnnotation).toBe("{ name: string }");
  });

  it("defaults formatAnnotation to null when absent", () => {
    expect(parse("Hello").formatAnnotation).toBeNull();
  });

  it("rejects unknown <%! ... !%> directives", () => {
    expect(() => parse("<%! foo: bar !%>")).toThrow(TseSyntaxError);
  });
});
