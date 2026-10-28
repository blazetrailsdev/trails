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

    it("should parse at-rules even though they may be invalid in the given context", () => {
      const tree = parse("@import 'foo.css'; a:b; @import 'bar.css'");

      const fooPrelude = [
        { node: "whitespace", pos: 7, raw: " " },
        { node: "string", pos: 8, raw: "'foo.css'", value: "foo.css" },
      ];
      const barPrelude = [
        { node: "whitespace", pos: 31, raw: " " },
        { node: "string", pos: 32, raw: "'bar.css'", value: "bar.css" },
      ];
      expect(tree).toEqual([
        {
          node: "at_rule",
          name: "import",
          prelude: fooPrelude,
          tokens: [
            { node: "at_keyword", pos: 0, raw: "@import", value: "import" },
            ...fooPrelude,
            { node: "semicolon", pos: 17, raw: ";" },
          ],
        },
        { node: "whitespace", pos: 18, raw: " " },
        {
          node: "property",
          name: "a",
          value: "b",
          children: [{ node: "ident", pos: 21, raw: "b", value: "b" }],
          important: false,
          tokens: [
            { node: "ident", pos: 19, raw: "a", value: "a" },
            { node: "colon", pos: 20, raw: ":" },
            { node: "ident", pos: 21, raw: "b", value: "b" },
          ],
        },
        { node: "semicolon", pos: 22, raw: ";" },
        { node: "whitespace", pos: 23, raw: " " },
        {
          node: "at_rule",
          name: "import",
          prelude: barPrelude,
          tokens: [{ node: "at_keyword", pos: 24, raw: "@import", value: "import" }, ...barPrelude],
        },
      ]);
    });

    it("should parse at-rules with a {} simple block immediately following the prelude", () => {
      let tree = parse(
        `
        @page :right {
          @top-center { content: "Preliminary edition" }
          @bottom-center { content: counter(page) }
        }
      `.trim(),
      );

      tree = parse(tree[0].block);

      const topBlock = [
        { node: "whitespace", pos: 38, raw: " " },
        { node: "ident", pos: 39, raw: "content", value: "content" },
        { node: "colon", pos: 46, raw: ":" },
        { node: "whitespace", pos: 47, raw: " " },
        { node: "string", pos: 48, raw: '"Preliminary edition"', value: "Preliminary edition" },
        { node: "whitespace", pos: 69, raw: " " },
      ];
      const counterTokens = [
        { node: "function", pos: 108, raw: "counter(", value: "counter" },
        { node: "ident", pos: 116, raw: "page", value: "page" },
        { node: ")", pos: 120, raw: ")" },
      ];
      const bottomBlock = [
        { node: "whitespace", pos: 98, raw: " " },
        { node: "ident", pos: 99, raw: "content", value: "content" },
        { node: "colon", pos: 106, raw: ":" },
        { node: "whitespace", pos: 107, raw: " " },
        {
          node: "function",
          name: "counter",
          value: [{ node: "ident", pos: 116, raw: "page", value: "page" }],
          tokens: counterTokens,
        },
        { node: "whitespace", pos: 121, raw: " " },
      ];
      expect(tree).toEqual([
        { node: "whitespace", pos: 14, raw: "\n          " },
        {
          node: "at_rule",
          name: "top-center",
          prelude: [{ node: "whitespace", pos: 36, raw: " " }],
          block: topBlock,
          tokens: [
            { node: "at_keyword", pos: 25, raw: "@top-center", value: "top-center" },
            { node: "whitespace", pos: 36, raw: " " },
            {
              node: "simple_block",
              start: "{",
              end: "}",
              value: topBlock,
              tokens: [
                { node: "{", pos: 37, raw: "{" },
                ...topBlock,
                { node: "}", pos: 70, raw: "}" },
              ],
            },
          ],
        },
        { node: "whitespace", pos: 71, raw: "\n          " },
        {
          node: "at_rule",
          name: "bottom-center",
          prelude: [{ node: "whitespace", pos: 96, raw: " " }],
          block: bottomBlock,
          tokens: [
            { node: "at_keyword", pos: 82, raw: "@bottom-center", value: "bottom-center" },
            { node: "whitespace", pos: 96, raw: " " },
            {
              node: "simple_block",
              start: "{",
              end: "}",
              value: bottomBlock,
              tokens: [
                { node: "{", pos: 97, raw: "{" },
                ...bottomBlock.slice(0, 4),
                ...counterTokens,
                { node: "whitespace", pos: 121, raw: " " },
                { node: "}", pos: 122, raw: "}" },
              ],
            },
          ],
        },
        { node: "whitespace", pos: 123, raw: "\n        " },
      ]);
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
