/* eslint-disable @typescript-eslint/no-explicit-any -- a racc value stack holds tokens and strings untyped, as Ruby's does. */
import { STDERR } from "@blazetrails/ruby-compat";
import { Parser as RaccParser } from "@blazetrails/ruby-compat/racc/parser";

interface PoData {
  set(msgid: string, msgstr: string): unknown;
  setComment(msgidOrSym: string, comment: string): void;
}

let $ignoreFuzzy = true;

// prettier-ignore
const raccReduceTable = [
  0, 0, "raccError",
  0, 10, "_reduceNone",
  2, 10, "_reduceNone",
  2, 10, "_reduceNone",
  2, 10, "_reduceNone",
  2, 12, "_reduce5",
  1, 13, "_reduceNone",
  1, 13, "_reduceNone",
  4, 15, "_reduce8",
  5, 16, "_reduce9",
  2, 17, "_reduce10",
  1, 17, "_reduceNone",
  3, 18, "_reduce12",
  1, 11, "_reduce13",
  2, 14, "_reduce14",
  1, 14, "_reduce15",
];

const raccReduceN = 16;

const raccShiftN = 26;

// prettier-ignore
const raccActionTable = [
  3, 13, 5, 7, 9, 15, 16, 17, 20, 17,
  13, 17, 13, 13, 11, 17, 23, 20, 13, 17,
];

// prettier-ignore
const raccActionCheck = [
  1, 16, 1, 1, 1, 12, 12, 12, 18, 18,
  7, 14, 15, 9, 3, 19, 20, 21, 23, 25,
];

// prettier-ignore
const raccActionPointer = [
  null, 0, null, 14, null, null, null, 3, null, 6,
  null, null, 0, null, 4, 5, -6, null, 2, 8,
  8, 11, null, 11, null, 12,
];

// prettier-ignore
const raccActionDefault = [
  -1, -16, -2, -16, -3, -13, -4, -16, -6, -16,
  -7, 26, -16, -15, -5, -16, -16, -14, -16, -8,
  -16, -9, -11, -16, -10, -12,
];

// prettier-ignore
const raccGotoTable = [
  12, 22, 14, 4, 24, 6, 2, 8, 18, 19,
  10, 21, 1, null, null, null, 25,
];

// prettier-ignore
const raccGotoCheck = [
  5, 9, 5, 3, 9, 4, 2, 6, 5, 5,
  7, 8, 1, null, null, null, 5,
];

// prettier-ignore
const raccGotoPointer = [null, 12, 5, 2, 4, -7, 6, 9, -7, -17];

// prettier-ignore
const raccGotoDefault = [null, null, null, null, null, null, null, null, null, null];

const raccTokenTable = {
  false: 0,
  error: 1,
  COMMENT: 2,
  MSGID: 3,
  MSGCTXT: 4,
  MSGID_PLURAL: 5,
  MSGSTR: 6,
  STRING: 7,
  PLURAL_NUM: 8,
};

const raccUseResultVar = true;

const raccNtBase = 9;

export class PoParser extends RaccParser {
  static Racc_arg = [
    raccActionTable,
    raccActionCheck,
    raccActionDefault,
    raccActionPointer,
    raccGotoTable,
    raccGotoCheck,
    raccGotoDefault,
    raccGotoPointer,
    raccNtBase,
    raccReduceTable,
    raccTokenTable,
    raccShiftN,
    raccReduceN,
    raccUseResultVar,
  ] as RaccParser["constructor"]["Racc_arg"];

  // prettier-ignore
  static Racc_token_to_s_table = [
    "$end", "error", "COMMENT", "MSGID", "MSGCTXT", "MSGID_PLURAL", "MSGSTR", "STRING",
    "PLURAL_NUM", "$start", "msgfmt", "comment", "msgctxt", "message", "string_list",
    "single_message", "plural_message", "msgstr_plural", "msgstr_plural_line",
  ];

  static Racc_debug_parser = true;

  /** @internal */
  _comments: string[] = [];
  /** @internal */
  _data!: PoData;
  /** @internal */
  _fuzzy = false;
  /** @internal */
  _msgctxt = "";
  /** @internal */
  _q: [string | false, string][] = [];

  _(x: string): string {
    return x;
  }

  unescape(orig: string): string {
    let ret = orig.replace(/\\n/g, "\n");
    ret = ret.replace(/\\t/g, "\t");
    ret = ret.replace(/\\r/g, "\r");
    ret = ret.replace(/\\"/g, '"');
    return ret;
  }

  parse<T extends PoData>(str: string, data: T, ignoreFuzzy = true): T {
    this._comments = [];
    this._data = data;
    this._fuzzy = false;
    this._msgctxt = "";
    $ignoreFuzzy = ignoreFuzzy;

    str = str.trim();
    this._q = [];
    let m: RegExpMatchArray | null;
    while (str.length !== 0) {
      if ((m = str.match(/^\s+/))) {
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^msgctxt/))) {
        this._q.push(["MSGCTXT", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^msgid_plural/))) {
        this._q.push(["MSGID_PLURAL", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^msgid/))) {
        this._q.push(["MSGID", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^msgstr/))) {
        this._q.push(["MSGSTR", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^\[(\d+)\]/))) {
        this._q.push(["PLURAL_NUM", m[1]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^#~([^\n]*)/))) {
        STDERR.print(this._("Warning: obsolete msgid exists.\n"));
        STDERR.print(`         ${m[0]}\n`);
        this._q.push(["COMMENT", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^#([^\n]*)/))) {
        this._q.push(["COMMENT", m[0]]);
        str = str.slice(m[0].length);
      } else if ((m = str.match(/^"([^\n]*)"/))) {
        this._q.push(["STRING", m[1]]);
        str = str.slice(m[0].length);
      } else {
        str = str.slice(1);
      }
    }
    this._q.push([false, "$end"]);
    this.doParse();

    if (this._comments.length > 0) {
      this._data.setComment(":last", this._comments.join("\n"));
    }
    return data;
  }

  override nextToken(): [string | false, unknown] | undefined {
    return this._q.shift();
  }

  onMessage(msgid: string, msgstr: string): void {
    if (msgstr.length > 0) {
      this._data.set(msgid, msgstr);
      this._data.setComment(msgid, this._comments.join("\n"));
    }
    this._comments.length = 0;
    this._msgctxt = "";
  }

  onComment(comment: string): void {
    if (/fuzzy/.test(comment)) this._fuzzy = true;
    this._comments.push(comment);
  }

  /** @internal */
  _reduce5(val: any[], _values: any[], result: any): any {
    this._msgctxt = this.unescape(val[1]) + "\u0004";
    return result;
  }

  /** @internal */
  _reduce8(val: any[], _values: any[], result: any): any {
    if (this._fuzzy && $ignoreFuzzy) {
      if (val[1] !== "") {
        STDERR.print(this._("Warning: fuzzy message was ignored.\n"));
        STDERR.print(`         msgid '${val[1]}'\n`);
      } else {
        this.onMessage("", this.unescape(val[3]));
      }
      this._fuzzy = false;
    } else {
      this.onMessage(this._msgctxt + this.unescape(val[1]), this.unescape(val[3]));
    }
    result = "";
    return result;
  }

  /** @internal */
  _reduce9(val: any[], _values: any[], result: any): any {
    if (this._fuzzy && $ignoreFuzzy) {
      if (val[1] !== "") {
        STDERR.print(this._("Warning: fuzzy message was ignored.\n"));
        STDERR.print(`msgid = '${val[1]}\n`);
      } else {
        this.onMessage("", this.unescape(val[3]));
      }
      this._fuzzy = false;
    } else {
      this.onMessage(
        this._msgctxt + this.unescape(val[1]) + "\u0000" + this.unescape(val[3]),
        this.unescape(val[4]),
      );
    }
    result = "";
    return result;
  }

  /** @internal */
  _reduce10(val: any[], _values: any[], result: any): any {
    if (val[0].length > 0) {
      result = val[0] + "\u0000" + val[1];
    } else {
      result = "";
    }
    return result;
  }

  /** @internal */
  _reduce12(val: any[], _values: any[], result: any): any {
    result = val[2];
    return result;
  }

  /** @internal */
  _reduce13(val: any[], _values: any[], result: any): any {
    this.onComment(val[0]);
    return result;
  }

  /**
   * @internal
   * @missingRailsArgs join — PERMANENT
   */
  _reduce14(val: any[], _values: any[], result: any): any {
    result = val.filter((item) => item !== "").join("");
    return result;
  }

  /** @internal */
  _reduce15(val: any[], _values: any[], result: any): any {
    result = val[0];
    return result;
  }

  /** @internal */
  _reduceNone(_val: any[], _values: any[], result: any): any {
    return result;
  }
}
