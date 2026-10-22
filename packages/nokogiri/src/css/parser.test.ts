import { describe, expect, it } from "vitest";

import { Parser } from "./parser.js";

describe("Nokogiri::CSS::Parser", () => {
  const parser = new Parser();

  it("#find_by_type", () => {
    const ast = parser.parse("a:nth-child(2)")[0];
    const matches = ast.findByType([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME"],
      ["PSEUDO_CLASS", ["FUNCTION"]],
    ]);
    expect(matches.length).toEqual(1);
    expect(matches[0]).toEqual(ast);
  });

  it("#to_type", () => {
    const ast = parser.parse("a:nth-child(2)")[0];
    expect(ast.toType()).toEqual([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME"],
      ["PSEUDO_CLASS", ["FUNCTION"]],
    ]);
  });

  it("#to_a_", () => {
    const asts = parser.parse("a:nth-child(2)");
    expect(asts[0].toA()).toEqual([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME", ["a"]],
      ["PSEUDO_CLASS", ["FUNCTION", ["nth-child("], ["2"]]],
    ]);
  });

  it("parses xpath attributes in conditional selectors", () => {
    const ast = parser.parse("a[@class~=bar]")[0];
    expect(ast.toA()).toEqual([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME", ["a"]],
      ["ATTRIBUTE_CONDITION", ["ATTRIB_NAME", ["class"]], ["includes"], ["bar"]],
    ]);
  });

  it("parses xpath attributes", () => {
    const ast = parser.parse("a/@href")[0];
    expect(ast.toA()).toEqual([
      "CHILD_SELECTOR",
      ["ELEMENT_NAME", ["a"]],
      ["ATTRIB_NAME", ["href"]],
    ]);
  });

  it("parses xpath attributes passed to xpath functions", () => {
    let ast = parser.parse("a:foo(@href)")[0];
    expect(ast.toA()).toEqual([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME", ["a"]],
      ["PSEUDO_CLASS", ["FUNCTION", ["foo("], ["ATTRIB_NAME", ["href"]]]],
    ]);

    ast = parser.parse("a:foo(@href,@id)")[0];
    expect(ast.toA()).toEqual([
      "CONDITIONAL_SELECTOR",
      ["ELEMENT_NAME", ["a"]],
      ["PSEUDO_CLASS", ["FUNCTION", ["foo("], ["ATTRIB_NAME", ["href"]], ["ATTRIB_NAME", ["id"]]]],
    ]);
  });
});
