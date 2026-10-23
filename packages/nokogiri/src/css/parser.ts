/* eslint-disable @typescript-eslint/no-explicit-any -- a racc value stack holds tokens, Nodes and arrays untyped, as Ruby's does. */
import { rbObjAsString } from "@blazetrails/ruby-compat";

import { Parser as RaccParser, ParseError } from "../racc/parser.js";
import { Node } from "./node.js";
import { SyntaxError } from "./syntax-error.js";
import { Tokenizer } from "./tokenizer.js";
import type { XPathVisitor } from "./xpath-visitor.js";

// prettier-ignore
const raccActionTable = [
  27, 11, 38, 99, 36, 12, 40, 26, 48, 25, 49, 27, 100, 12, 30, 36, 105, 99, -26, 28, 25, -26, 26,
  27, 29, 14, 21, 23, 80, 30, 28, 36, 72, 26, -26, 29, 14, 21, 23, 27, 30, 91, 56, 36, 97, 96, 43,
  29, 25, 26, 27, 92, 94, 21, 36, 95, 30, 98, 28, 25, 101, 26, 102, 29, 14, 21, 23, 96, 30, 28, 36,
  36, 26, 103, 29, 14, 21, 23, 27, 30, 108, 107, 36, 109, 106, 43, 43, 25, 26, 26, 27, 110, 21, 21,
  111, 30, 30, 28, 99, 50, 26, 53, 29, 14, 21, 23, 36, 30, 36, 56, 61, 64, 113, 66, 29, 14, 116,
  36, 118, 36, null, 43, null, 43, 26, null, 26, 14, 21, 23, 21, 30, 43, 30, 43, 26, null, 26, 36,
  21, 36, 21, 30, 25, 30, null, null, null, null, null, null, 61, 62, 43, 60, 43, 26, null, 26,
  null, 21, 23, 21, 30, 57, 30, 88, 89, 14, null, null, 88, 89, null, null, null, null, 84, 85, 86,
  null, 87, 84, 85, 86, 83, 87, null, 61, 93, 83, 66, 61, 93, null, 66, 61, 93, null, 66, 61, 93,
  null, 66, null, 14, null, 61, 93, 14, 66, null, null, 14, null, null, null, 14, 4, 5, 10, null,
  null, null, 14, 4, 5, 47, 6, null, 8, 7, 4, 5, 10, 6, null, 8, 7, null, null, null, 6, null, 8,
  7,
];

// prettier-ignore
const raccActionCheck = [
  3, 1, 11, 64, 3, 70, 14, 17, 21, 3, 24, 9, 62, 1, 17, 9, 70, 62, 25, 3, 9, 64, 3, 30, 3, 3, 3, 3,
  49, 3, 9, 16, 30, 9, 50, 9, 9, 9, 9, 12, 9, 53, 30, 12, 60, 60, 16, 30, 12, 16, 46, 54, 58, 16,
  46, 59, 16, 61, 12, 46, 63, 12, 65, 12, 12, 12, 12, 66, 12, 46, 31, 32, 46, 67, 46, 46, 46, 46,
  47, 46, 82, 82, 47, 82, 81, 31, 32, 47, 31, 32, 26, 90, 31, 32, 92, 31, 32, 47, 93, 26, 47, 26,
  47, 47, 47, 47, 28, 47, 33, 26, 28, 28, 97, 28, 26, 26, 100, 34, 113, 35, null, 28, null, 33, 28,
  null, 33, 28, 28, 28, 33, 28, 34, 33, 35, 34, null, 35, 43, 34, 68, 35, 34, 43, 35, null, null,
  null, null, null, null, 27, 27, 43, 27, 68, 43, null, 68, null, 43, 43, 68, 43, 27, 68, 51, 51,
  27, null, null, 52, 52, null, null, null, null, 51, 51, 51, null, 51, 52, 52, 52, 51, 52, null,
  56, 56, 52, 56, 96, 96, null, 96, 98, 98, null, 98, 99, 99, null, 99, null, 56, null, 101, 101,
  96, 101, null, null, 98, null, null, null, 99, 0, 0, 0, null, null, null, 101, 20, 20, 20, 0,
  null, 0, 0, 29, 29, 29, 20, null, 20, 20, null, null, null, 29, null, 29, 29,
];

// prettier-ignore
const raccActionPointer = [
  211, 1, null, -2, null, null, null, null, null, 9, null, 2, 37, null, -5, null, 25, -17, null,
  null, 218, -3, null, null, -20, -12, 88, 141, 100, 225, 21, 64, 65, 102, 111, 113, null, null,
  null, null, null, null, null, 132, null, null, 48, 76, null, 17, 4, 163, 168, 16, 21, null, 178,
  null, 29, 32, 33, 45, 5, 48, -9, 39, 55, 50, 134, null, -7, null, null, null, null, null, null,
  null, null, null, null, 59, 70, null, null, null, null, null, null, null, 66, null, 83, 86, null,
  null, 182, 105, 186, 190, 103, 197, null, null, null, null, null, null, null, null, null, null,
  null, 105, null, null, null, null, null,
];

// prettier-ignore
const raccActionDefault = [
  -81, -82, -2, -27, -4, -5, -6, -7, -8, -27, -80, -82, -27, -3, -82, -10, -53, -12, -15, -16, -20,
  -82, -22, -23, -82, -25, -27, -82, -27, -81, -82, -59, -60, -61, -62, -63, -64, -17, 119, -1, -9,
  -11, -52, -27, -13, -14, -27, -27, -21, -82, -32, -68, -68, -82, -82, -33, -82, -34, -82, -82,
  -43, -44, -45, -46, -25, -82, -43, -82, -77, -79, -82, -50, -51, -54, -55, -56, -57, -58, -18,
  -19, -24, -82, -82, -69, -70, -71, -72, -73, -74, -75, -82, -30, -82, -45, -35, -36, -82, -49,
  -82, -82, -82, -82, -37, -76, -78, -38, -28, -65, -66, -67, -29, -31, -39, -82, -40, -41, -48,
  -42, -47,
];

// prettier-ignore
const raccGotoTable = [
  58, 42, 13, 1, 46, 52, 19, 68, 37, 71, 41, 39, 19, 69, 44, 19, 73, 74, 75, 76, 77, 45, 68, 81,
  90, 54, 51, 59, 69, 55, null, null, 70, null, null, null, null, null, null, null, null, null,
  null, null, null, 78, 79, null, null, 19, 19, null, null, 104, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, 112, null, 114, 115, null, 117,
];

// prettier-ignore
const raccGotoCheck = [
  20, 14, 2, 1, 5, 11, 7, 9, 2, 11, 10, 2, 7, 14, 12, 7, 14, 14, 14, 14, 14, 13, 9, 19, 19, 17, 18,
  21, 14, 7, null, null, 1, null, null, null, null, null, null, null, null, null, null, null, null,
  2, 2, null, null, 7, 7, null, null, 14, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, 20, null, 20, 20, null, 20,
];

// prettier-ignore
const raccGotoPointer = [
  null, 3, -1, null, null, -16, null, 3, null, -21, -6, -21, -3, 4, -15, null, null, -1, 0, -28,
  -27, 0, null, null, null, null,
];

// prettier-ignore
const raccGotoDefault = [
  null, null, null, 2, 3, 9, 15, 63, 20, 16, null, 17, 34, 33, 18, 32, 22, 24, null, null, 65,
  null, 31, 35, 82, 67,
];

// prettier-ignore
const raccReduceTable = [
  0, 0, "raccError", 3, 33, "_reduce1", 1, 33, "_reduce2", 2, 33, "_reduce3", 1, 37, "_reduce4", 1,
  37, "_reduce5", 1, 37, "_reduce6", 1, 37, "_reduce7", 1, 37, "_reduce8", 2, 38, "_reduce9", 1,
  39, "_reduce10", 2, 40, "_reduce11", 1, 40, "_reduceNone", 2, 40, "_reduce13", 2, 40,
  "_reduce14", 1, 40, "_reduce15", 1, 40, "_reduceNone", 2, 35, "_reduce17", 3, 34, "_reduce18", 3,
  34, "_reduce19", 1, 34, "_reduceNone", 2, 47, "_reduce21", 1, 41, "_reduceNone", 1, 41,
  "_reduce23", 3, 48, "_reduce24", 1, 48, "_reduce25", 1, 49, "_reduce26", 0, 49, "_reduceNone", 4,
  45, "_reduce28", 4, 45, "_reduce29", 3, 45, "_reduce30", 3, 50, "_reduce31", 1, 50, "_reduce32",
  1, 50, "_reduceNone", 2, 43, "_reduce34", 3, 43, "_reduce35", 3, 43, "_reduce36", 3, 43,
  "_reduce37", 3, 43, "_reduce38", 3, 52, "_reduce39", 3, 52, "_reduce40", 3, 52, "_reduce41", 3,
  52, "_reduce42", 1, 52, "_reduceNone", 1, 52, "_reduceNone", 1, 52, "_reduce45", 1, 52,
  "_reduceNone", 4, 53, "_reduce47", 3, 53, "_reduce48", 2, 53, "_reduce49", 2, 44, "_reduce50", 2,
  44, "_reduce51", 1, 42, "_reduceNone", 0, 42, "_reduceNone", 2, 46, "_reduce54", 2, 46,
  "_reduce55", 2, 46, "_reduce56", 2, 46, "_reduce57", 2, 46, "_reduce58", 1, 46, "_reduceNone", 1,
  46, "_reduceNone", 1, 46, "_reduceNone", 1, 46, "_reduceNone", 1, 46, "_reduceNone", 1, 54,
  "_reduce64", 2, 51, "_reduce65", 2, 51, "_reduce66", 2, 51, "_reduce67", 0, 51, "_reduceNone", 1,
  56, "_reduce69", 1, 56, "_reduce70", 1, 56, "_reduce71", 1, 56, "_reduce72", 1, 56, "_reduce73",
  1, 56, "_reduce74", 1, 56, "_reduce75", 3, 55, "_reduce76", 1, 57, "_reduceNone", 2, 57,
  "_reduceNone", 1, 57, "_reduceNone", 1, 36, "_reduceNone", 0, 36, "_reduceNone",
];

export class Parser extends RaccParser {
  static Racc_arg = [
    raccActionTable,
    raccActionCheck,
    raccActionDefault,
    raccActionPointer,
    raccGotoTable,
    raccGotoCheck,
    raccGotoDefault,
    raccGotoPointer,
    32,
    raccReduceTable,
    {
      ...{ false: 0, error: 1, FUNCTION: 2, INCLUDES: 3, DASHMATCH: 4, LBRACE: 5, HASH: 6 },
      ...{ PLUS: 7, GREATER: 8, S: 9, STRING: 10, IDENT: 11, COMMA: 12, NUMBER: 13 },
      ...{ PREFIXMATCH: 14, SUFFIXMATCH: 15, SUBSTRINGMATCH: 16, TILDE: 17, NOT_EQUAL: 18 },
      ...{ SLASH: 19, DOUBLESLASH: 20, NOT: 21, EQUAL: 22, RPAREN: 23, LSQUARE: 24 },
      ...{ RSQUARE: 25, HAS: 26, "@": 27, ".": 28, "*": 29, "|": 30, ":": 31 },
    },
    119,
    82,
    true,
  ] as RaccParser["constructor"]["Racc_arg"];

  // prettier-ignore
  static Racc_token_to_s_table = [
    "$end", "error", "FUNCTION", "INCLUDES", "DASHMATCH", "LBRACE", "HASH", "PLUS", "GREATER",
    "S", "STRING", "IDENT", "COMMA", "NUMBER", "PREFIXMATCH", "SUFFIXMATCH", "SUBSTRINGMATCH",
    "TILDE", "NOT_EQUAL", "SLASH", "DOUBLESLASH", "NOT", "EQUAL", "RPAREN", "LSQUARE", "RSQUARE",
    "HAS", '"@"', '"."', '"*"', '"|"', '":"', "$start", "selector", "simple_selector_1toN",
    "prefixless_combinator_selector", "optional_S", "combinator", "xpath_attribute_name",
    "xpath_attribute", "simple_selector", "element_name", "hcap_0toN", "function", "pseudo",
    "attrib", "hcap_1toN", "class", "namespaced_ident", "namespace", "attrib_name",
    "attrib_val_0or1", "expr", "nth", "attribute_id", "negation", "eql_incl_dash", "negation_arg",
  ];

  static Racc_debug_parser = false;

  /** @internal */
  _tokenizer: Tokenizer;

  constructor() {
    super();
    this._tokenizer = new Tokenizer();
  }

  unescapeCssIdentifier(identifier: string): string {
    return identifier.replace(/\\(?:([^0-9a-fA-F])|([0-9a-fA-F]{1,6})\s?)/g, (_m, $1, $2) =>
      $1 != null ? $1 : String.fromCodePoint(parseInt($2, 16)),
    );
  }

  unescapeCssString(str: string): string {
    return str.replace(/\\(?:([^0-9a-fA-F])|([0-9a-fA-F]{1,6})\s?)/g, (_m, $1, $2) => {
      if ($1 === "\n") {
        return "";
      } else {
        return $1 != null ? $1 : String.fromCodePoint(parseInt($2, 16));
      }
    });
  }

  parse(string: string): Node[] {
    this._tokenizer.scanSetup(string);
    return this.doParse() as Node[];
  }

  override nextToken(): [string, string] | undefined {
    return this._tokenizer.nextToken();
  }

  xpathFor(selector: string, visitor: XPathVisitor): string[] {
    return this.parse(selector).map((ast) => ast.toXpath(visitor));
  }

  override onError(_errorTokenId: number, errorValue: unknown, valueStack: unknown[]): never {
    const after = valueStack.filter((v) => v != null).at(-1);
    throw new SyntaxError(
      `unexpected '${rbObjAsString(errorValue)}' after '${rbObjAsString(after)}'`,
    );
  }

  _reduce1(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[2]].flat(Infinity);
  }

  _reduce2(val: any[], _values: unknown[], _result: unknown) {
    return val.flat(Infinity);
  }

  _reduce3(val: any[], _values: unknown[], _result: unknown) {
    return [val[1]].flat(Infinity);
  }

  _reduce4(_val: any[], _values: unknown[], _result: unknown) {
    return "DIRECT_ADJACENT_SELECTOR";
  }

  _reduce5(_val: any[], _values: unknown[], _result: unknown) {
    return "CHILD_SELECTOR";
  }

  _reduce6(_val: any[], _values: unknown[], _result: unknown) {
    return "FOLLOWING_SELECTOR";
  }

  _reduce7(_val: any[], _values: unknown[], _result: unknown) {
    return "DESCENDANT_SELECTOR";
  }

  _reduce8(_val: any[], _values: unknown[], _result: unknown) {
    return "CHILD_SELECTOR";
  }

  _reduce9(val: any[], _values: unknown[], _result: unknown) {
    return val[1];
  }

  _reduce10(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ATTRIB_NAME", [val[0]]);
  }

  _reduce11(val: any[], _values: unknown[], _result: unknown) {
    return val[1] == null ? val[0] : new Node("CONDITIONAL_SELECTOR", [val[0], val[1]]);
  }

  _reduce13(val: any[], _values: unknown[], _result: unknown) {
    return new Node("CONDITIONAL_SELECTOR", val);
  }

  _reduce14(val: any[], _values: unknown[], _result: unknown) {
    return new Node("CONDITIONAL_SELECTOR", val);
  }

  _reduce15(val: any[], _values: unknown[], _result: unknown) {
    return new Node("CONDITIONAL_SELECTOR", [new Node("ELEMENT_NAME", ["*"]), val[0]]);
  }

  _reduce17(val: any[], _values: unknown[], _result: unknown) {
    return new Node(val[0], [null, val[1]]);
  }

  _reduce18(val: any[], _values: unknown[], _result: unknown) {
    return new Node(val[1], [val[0], val[2]]);
  }

  _reduce19(val: any[], _values: unknown[], _result: unknown) {
    return new Node("DESCENDANT_SELECTOR", [val[0], val[2]]);
  }

  _reduce21(val: any[], _values: unknown[], _result: unknown) {
    return new Node("CLASS_CONDITION", [this.unescapeCssIdentifier(val[1])]);
  }

  _reduce23(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ELEMENT_NAME", val);
  }

  _reduce24(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ELEMENT_NAME", [val[0], val[2]]);
  }

  _reduce25(val: any[], _values: unknown[], _result: unknown) {
    const name = val[0];
    return new Node("ELEMENT_NAME", [name]);
  }

  _reduce26(val: any[], _values: unknown[], _result: unknown) {
    return val[0];
  }

  _reduce28(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ATTRIBUTE_CONDITION", [val[1], ...(val[2] ?? [])]);
  }

  _reduce29(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ATTRIBUTE_CONDITION", [val[1], ...(val[2] ?? [])]);
  }

  _reduce30(val: any[], _values: unknown[], _result: unknown) {
    return new Node("PSEUDO_CLASS", [new Node("FUNCTION", ["nth-child(", val[1]])]);
  }

  _reduce31(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ATTRIB_NAME", [[val[0], val[2]].filter((v) => v != null).join(":")]);
  }

  _reduce32(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ATTRIB_NAME", [val[0]]);
  }

  _reduce34(val: any[], _values: unknown[], _result: unknown) {
    return new Node("FUNCTION", [val[0].trim()]);
  }

  _reduce35(val: any[], _values: unknown[], _result: unknown) {
    return new Node("FUNCTION", [val[0].trim(), val[1]].flat(Infinity));
  }

  _reduce36(val: any[], _values: unknown[], _result: unknown) {
    return new Node("FUNCTION", [val[0].trim(), val[1]].flat(Infinity));
  }

  _reduce37(val: any[], _values: unknown[], _result: unknown) {
    return new Node("FUNCTION", [val[0].trim(), val[1]].flat(Infinity));
  }

  _reduce38(val: any[], _values: unknown[], _result: unknown) {
    return new Node("FUNCTION", [val[0].trim(), val[1]].flat(Infinity));
  }

  _reduce39(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[2]];
  }

  _reduce40(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[2]];
  }

  _reduce41(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[2]];
  }

  _reduce42(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[2]];
  }

  _reduce45(val: any[], _values: unknown[], _result: unknown) {
    switch (val[0]) {
      case "even":
        return new Node("NTH", ["2", "n", "+", "0"]);
      case "odd":
        return new Node("NTH", ["2", "n", "+", "1"]);
      case "n":
        return new Node("NTH", ["1", "n", "+", "0"]);
      default:
        return val;
    }
  }

  _reduce47(val: any[], _values: unknown[], _result: unknown) {
    if (val[1] === "n") {
      return new Node("NTH", val);
    } else {
      throw new ParseError(`parse error on IDENT '${val[1]}'`);
    }
  }

  _reduce48(val: any[], _values: unknown[], _result: unknown) {
    if (val[0] === "n") {
      val.unshift("1");
      return new Node("NTH", val);
    } else if (val[0] === "-n") {
      val[0] = "n";
      val.unshift("-1");
      return new Node("NTH", val);
    } else {
      throw new ParseError(`parse error on IDENT '${val[1]}'`);
    }
  }

  _reduce49(val: any[], _values: unknown[], _result: unknown) {
    const n = val[1];
    if (n.slice(0, 2) === "n-") {
      val[1] = "n";
      val.push("-");
      val.push(n.slice(2));
      return new Node("NTH", val);
    } else if (n === "n") {
      val.push("+");
      val.push("0");
      return new Node("NTH", val);
    } else {
      throw new ParseError(`parse error on IDENT '${val[1]}'`);
    }
  }

  _reduce50(val: any[], _values: unknown[], _result: unknown) {
    return new Node("PSEUDO_CLASS", [val[1]]);
  }

  _reduce51(val: any[], _values: unknown[], _result: unknown) {
    return new Node("PSEUDO_CLASS", [val[1]]);
  }

  _reduce54(val: any[], _values: unknown[], _result: unknown) {
    return new Node("COMBINATOR", val);
  }

  _reduce55(val: any[], _values: unknown[], _result: unknown) {
    return new Node("COMBINATOR", val);
  }

  _reduce56(val: any[], _values: unknown[], _result: unknown) {
    return new Node("COMBINATOR", val);
  }

  _reduce57(val: any[], _values: unknown[], _result: unknown) {
    return new Node("COMBINATOR", val);
  }

  _reduce58(val: any[], _values: unknown[], _result: unknown) {
    return new Node("COMBINATOR", val);
  }

  _reduce64(val: any[], _values: unknown[], _result: unknown) {
    return new Node("ID", [this.unescapeCssIdentifier(val[0])]);
  }

  _reduce65(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], this.unescapeCssIdentifier(val[1])];
  }

  _reduce66(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], this.unescapeCssString(val[1])];
  }

  _reduce67(val: any[], _values: unknown[], _result: unknown) {
    return [val[0], val[1]];
  }

  _reduce69(_val: any[], _values: unknown[], _result: unknown) {
    return "equal";
  }

  _reduce70(_val: any[], _values: unknown[], _result: unknown) {
    return "prefix_match";
  }

  _reduce71(_val: any[], _values: unknown[], _result: unknown) {
    return "suffix_match";
  }

  _reduce72(_val: any[], _values: unknown[], _result: unknown) {
    return "substring_match";
  }

  _reduce73(_val: any[], _values: unknown[], _result: unknown) {
    return "not_equal";
  }

  _reduce74(_val: any[], _values: unknown[], _result: unknown) {
    return "includes";
  }

  _reduce75(_val: any[], _values: unknown[], _result: unknown) {
    return "dash_match";
  }

  _reduce76(val: any[], _values: unknown[], _result: unknown) {
    return new Node("NOT", [val[1]]);
  }

  _reduceNone(val: any[], _values: unknown[], _result: unknown) {
    return val[0];
  }
}
