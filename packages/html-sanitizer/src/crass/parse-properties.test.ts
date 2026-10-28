import { describe, expect, it } from "vitest";

import { Parser as CP } from "./parser.js";
import { Tokenizer as CT, type TokenizerOptions } from "./tokenizer.js";

describe("Crass::Parser", () => {
  describe("#parse_properties", () => {
    const parse = (input: string, options?: TokenizerOptions) => CP.parseProperties(input, options);

    it("should return an empty tree when given an empty string", () => {
      expect(parse("")).toEqual([]);
    });

    it("should include semicolon and whitespace tokens", () => {
      expect(parse(";; /**/ ; ;")).toEqual(CT.tokenize(";; /**/ ; ;"));
    });

    it("should include semicolon, whitespace, and comment tokens when :preserve_comments == true", () => {
      const tree = parse(";; /**/ ; ;", { preserveComments: true });
      expect(tree).toEqual(CT.tokenize(";; /**/ ; ;", { preserveComments: true }));
    });

    it("should parse values containing functions", () => {
      const tree = parse('content: attr(data-foo) " ";');

      const attr = {
        node: "function",
        name: "attr",
        value: [{ node: "ident", pos: 14, raw: "data-foo", value: "data-foo" }],
        tokens: [
          { node: "function", pos: 9, raw: "attr(", value: "attr" },
          { node: "ident", pos: 14, raw: "data-foo", value: "data-foo" },
          { node: ")", pos: 22, raw: ")" },
        ],
      };
      const children = [
        { node: "whitespace", pos: 8, raw: " " },
        attr,
        { node: "whitespace", pos: 23, raw: " " },
        { node: "string", pos: 24, raw: '" "', value: " " },
      ];
      expect(tree).toEqual([
        {
          node: "property",
          name: "content",
          value: 'attr(data-foo) " "',
          children,
          important: false,
          tokens: [
            { node: "ident", pos: 0, raw: "content", value: "content" },
            { node: "colon", pos: 7, raw: ":" },
            ...children,
          ],
        },
        { node: "semicolon", pos: 27, raw: ";" },
      ]);
    });

    it("should parse values containing nested functions", () => {
      const tree = parse("width: expression(alert(1));");

      const one = { node: "number", pos: 24, raw: "1", repr: "1", type: "integer", value: 1 };
      const alert = {
        node: "function",
        name: "alert",
        value: [one],
        tokens: [
          { node: "function", pos: 18, raw: "alert(", value: "alert" },
          one,
          { node: ")", pos: 25, raw: ")" },
        ],
      };
      const expression = {
        node: "function",
        name: "expression",
        value: [alert],
        tokens: [
          { node: "function", pos: 7, raw: "expression(", value: "expression" },
          { node: "function", pos: 18, raw: "alert(", value: "alert" },
          one,
          { node: ")", pos: 25, raw: ")" },
          { node: ")", pos: 26, raw: ")" },
        ],
      };
      expect(tree).toEqual([
        {
          node: "property",
          name: "width",
          value: "expression(alert(1))",
          children: [{ node: "whitespace", pos: 6, raw: " " }, expression],
          important: false,
          tokens: [
            { node: "ident", pos: 0, raw: "width", value: "width" },
            { node: "colon", pos: 5, raw: ":" },
            { node: "whitespace", pos: 6, raw: " " },
            expression,
          ],
        },
        { node: "semicolon", pos: 27, raw: ";" },
      ]);
    });

    it("should not choke on a missing property value", () => {
      const tree = parse("font-family:");

      expect(tree).toEqual([
        {
          node: "property",
          name: "font-family",
          value: "",
          children: [],
          important: false,
          tokens: [
            { node: "ident", pos: 0, raw: "font-family", value: "font-family" },
            { node: "colon", pos: 11, raw: ":" },
          ],
        },
      ]);
    });
  });
});
