import { describe, expect, it } from "vitest";

import { getFs } from "@blazetrails/ruby-compat";
import { Parser } from "./parser.js";
import type { Node } from "./tokenizer.js";

const PUNCTUATION: Record<string, string> = {
  cdc: "-->",
  cdo: "<!--",
  colon: ":",
  column: "||",
  comma: ",",
  dash_match: "|=",
  include_match: "~=",
  prefix_match: "^=",
  semicolon: ";",
  substring_match: "*=",
  suffix_match: "$=",
  whitespace: " ",
};

function translateTokens(tokens: Node | Node[] | null): unknown[] {
  if (tokens == null) return [];

  const translated: unknown[] = [];
  if (!Array.isArray(tokens)) tokens = [tokens];

  for (const token of tokens) {
    const value = token.value;
    let result: unknown;

    if (Object.hasOwn(PUNCTUATION, token.node)) {
      translated.push(PUNCTUATION[token.node]);
      continue;
    }

    switch (token.node) {
      case "at_rule":
        result = [
          "at-rule",
          token.name,
          translateTokens(token.prelude),
          token.block != null ? translateTokens(token.block) : null,
        ];
        break;
      case "declaration":
        result = ["declaration", token.name, translateTokens(value), token.important];
        break;
      case "at_keyword":
        result = ["at-keyword", value];
        break;
      case "bad_string":
        result = ["error", "bad-string"];
        break;
      case "bad_url":
        result = ["error", "bad-url"];
        break;
      case "delim":
        result = value;
        break;
      case "dimension":
        result = ["dimension", token.repr, value, token.type, token.unit];
        break;
      case "error":
        result = ["error", value];
        break;
      case "function":
        result =
          token.name != null
            ? ["function", token.name, ...translateTokens(value)]
            : ["function", value];
        break;
      case "hash":
        result = ["hash", value, token.type];
        break;
      case "ident":
        result = ["ident", value];
        break;
      case "number":
        result = ["number", token.repr, value, token.type];
        break;
      case "percentage":
        result = ["percentage", token.repr, value, token.type];
        break;
      case "simple_block":
        result = [token.start + token.end, ...translateTokens(value)];
        break;
      case "string":
        result = ["string", value];
        break;
      case "unicode_range":
        result = ["unicode-range", token.start, token.end];
        break;
      case "url":
        result = ["url", value];
        break;
      case "}":
      case "]":
      case ")":
        result = ["error", token.node];
        break;
      default:
        result = null;
    }

    if (result != null) translated.push(result);
  }

  return translated;
}

// PERMANENT-SKIP: Crass's tokenizer (tokenizer.rb RE_NAME_START) reads every
const PERMANENT_SKIPS = new Set([
  "\\- red0 -red --red -\\-red\\ blue 0red -0red \u0000red _Red .red rêd r\\êd \x7f\x80\x81",
]);

async function loadCssTests(filename: string): Promise<unknown[]> {
  const path = new URL(`./css-parsing-tests/${filename}`, import.meta.url).pathname;
  return JSON.parse(await getFs().readFile(path, "utf8")) as unknown[];
}

function eachSlice2(tests: unknown[]): [string, unknown][] {
  const pairs: [string, unknown][] = [];
  for (let i = 0; i < tests.length; i += 2) pairs.push([tests[i] as string, tests[i + 1]]);
  return pairs;
}

const componentValueList = await loadCssTests("component_value_list.json");
const declarationList = await loadCssTests("declaration_list.json");

describe("CSS Parsing Tests", () => {
  describe("component_value_list", () => {
    for (const [css, expected] of eachSlice2(componentValueList)) {
      (PERMANENT_SKIPS.has(css) ? it.skip : it)(
        `should parse: ${css.replaceAll("\n", "\\n")}`,
        () => {
          const parser = new Parser(css);
          expect(translateTokens(parser.parseComponentValues())).toEqual(expected);
        },
      );
    }
  });

  describe("declaration_list", () => {
    for (const [css, expected] of eachSlice2(declarationList)) {
      it(`should parse: ${css.replaceAll("\n", "\\n")}`, () => {
        const parser = new Parser(css);
        expect(translateTokens(parser.parseDeclarations(parser.tokens, { strict: true }))).toEqual(
          expected,
        );
      });
    }
  });
});
