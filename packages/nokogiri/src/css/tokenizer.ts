import { StringScanner } from "@blazetrails/ruby-compat";

export class ScanError extends Error {
  override name = "Nokogiri::CSS::Tokenizer::ScanError";
}

const nonascii = String.raw`[^\0-\x7f]`;
const escape = String.raw`(\\[0-9A-Fa-f]{1,6}(\r\n|[\s])?|\\[^\n\r\f0-9A-Fa-f])`;
const nmchar = String.raw`([_A-Za-z0-9-]|${nonascii}|${escape})`;
const ident = String.raw`-?([_A-Za-z]|${nonascii}|${escape})${nmchar}*`;
const string = (q: string) =>
  String.raw`${q}([^\n\r\f${q}]|(\n|\r\n|\r|\f)|${nonascii}|${escape})*(?<!\\)(?:\\{2})*${q}`;

const RULES: [RegExp, string | null][] = [
  [/has\([\s]*/, "HAS"],
  [new RegExp(String.raw`${ident}\([\s]*`), "FUNCTION"],
  [new RegExp(ident), "IDENT"],
  [new RegExp(String.raw`\#${nmchar}+`), "HASH"],
  [/[\s]*~=[\s]*/, "INCLUDES"],
  [/[\s]*\|=[\s]*/, "DASHMATCH"],
  [/[\s]*\^=[\s]*/, "PREFIXMATCH"],
  [/[\s]*\$=[\s]*/, "SUFFIXMATCH"],
  [/[\s]*\*=[\s]*/, "SUBSTRINGMATCH"],
  [/[\s]*!=[\s]*/, "NOT_EQUAL"],
  [/[\s]*=[\s]*/, "EQUAL"],
  [/[\s]*\)/, "RPAREN"],
  [/\[[\s]*/, "LSQUARE"],
  [/[\s]*\]/, "RSQUARE"],
  [/[\s]*\+[\s]*/, "PLUS"],
  [/[\s]*>[\s]*/, "GREATER"],
  [/[\s]*,[\s]*/, "COMMA"],
  [/[\s]*~[\s]*/, "TILDE"],
  [/:not\([\s]*/, "NOT"],
  [/-?([0-9]+|[0-9]*\.[0-9]+)/, "NUMBER"],
  [/[\s]*\/\/[\s]*/, "DOUBLESLASH"],
  [/[\s]*\/[\s]*/, "SLASH"],
  [/U\+[0-9a-f?]{1,6}(-[0-9a-f]{1,6})?/, "UNICODE_RANGE"],
  [/[\s]+/, "S"],
  [new RegExp(`(${string('"')}|${string("'")})`), "STRING"],
  [/./, null],
];

export class Tokenizer {
  lineno = 1;
  state: string | null = null;
  /** @internal */
  _ss!: StringScanner;

  scanSetup(str: string): void {
    this._ss = new StringScanner(str);
    this.lineno = 1;
    this.state = null;
  }

  nextToken(): [string, string] | undefined {
    if (this._ss.isEos()) return;

    let token: [string, string] | undefined;
    while (!(token = this._nextToken()) && !this._ss.isEos());
    return token;
  }

  /** @internal */
  _nextToken(): [string, string] | undefined {
    let text: string | null = this._ss.peek(1);
    if (text === "\n") this.lineno += 1;
    if (this.state != null) throw new ScanError(`undefined state: '${this.state}'`);
    for (const [pattern, type] of RULES) {
      if ((text = this._ss.scan(pattern)) != null) return [type ?? text, text];
    }
    text = this._ss.string.slice(this._ss.pos);
    throw new ScanError(`can not match: '${text}'`);
  }
}
