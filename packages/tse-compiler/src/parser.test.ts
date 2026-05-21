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
      { kind: "text", value: "hi" },
      { kind: "expr", value: "name" },
    ]);
  });

  it("normalizes empty `locals: ()` to `**nil` and keeps the first directive on duplicates", () => {
    expect(parse("<%# locals: () %>").localsSignature).toBe("**nil");
    expect(parse("<%# locals: (a:) %><%# locals: (b:) %>").localsSignature).toBe("a:");
  });

  it("rejects unknown <%! ... !%> directives", () => {
    expect(() => parse("<%! foo: bar !%>")).toThrow(TseSyntaxError);
  });
});
