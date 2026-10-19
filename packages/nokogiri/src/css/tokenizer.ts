import { StringScanner } from "@blazetrails/ruby-compat";

export class ScanError extends Error {
  override name = "Nokogiri::CSS::Tokenizer::ScanError";
}

const nonascii = String.raw`[^\0-\x7f]`;
const escape = String.raw`(\\[0-9A-Fa-f]{1,6}(\r\n|[ \t\r\n\f\v])?|\\[^\n\r\f0-9A-Fa-f])`;
const nmchar = String.raw`([_A-Za-z0-9-]|${nonascii}|${escape})`;
const ident = String.raw`-?([_A-Za-z]|${nonascii}|${escape})${nmchar}*`;
const string = (q: string) =>
  String.raw`${q}([^\n\r\f${q}]|(\n|\r\n|\r|\f)|${nonascii}|${escape})*(?<!\\)(?:\\{2})*${q}`;

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

  action<T>(block: () => T): T {
    return block();
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
    if ((text = this._ss.scan(/has\([ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["HAS", text!]);
    }
    if ((text = this._ss.scan(new RegExp(String.raw`${ident}\([ \t\r\n\f\v]*`))) != null) {
      return this.action(() => ["FUNCTION", text!]);
    }
    if ((text = this._ss.scan(new RegExp(ident))) != null) {
      return this.action(() => ["IDENT", text!]);
    }
    if ((text = this._ss.scan(new RegExp(String.raw`\#${nmchar}+`))) != null) {
      return this.action(() => ["HASH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*~=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["INCLUDES", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\|=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["DASHMATCH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\^=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["PREFIXMATCH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\$=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["SUFFIXMATCH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\*=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["SUBSTRINGMATCH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*!=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["NOT_EQUAL", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*=[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["EQUAL", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\)/)) != null) {
      return this.action(() => ["RPAREN", text!]);
    }
    if ((text = this._ss.scan(/\[[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["LSQUARE", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\]/)) != null) {
      return this.action(() => ["RSQUARE", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\+[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["PLUS", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*>[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["GREATER", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*,[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["COMMA", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*~[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["TILDE", text!]);
    }
    if ((text = this._ss.scan(/:not\([ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["NOT", text!]);
    }
    if ((text = this._ss.scan(/-?([0-9]+|[0-9]*\.[0-9]+)/)) != null) {
      return this.action(() => ["NUMBER", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\/\/[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["DOUBLESLASH", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]*\/[ \t\r\n\f\v]*/)) != null) {
      return this.action(() => ["SLASH", text!]);
    }
    if ((text = this._ss.scan(/U\+[0-9a-f?]{1,6}(-[0-9a-f]{1,6})?/)) != null) {
      return this.action(() => ["UNICODE_RANGE", text!]);
    }
    if ((text = this._ss.scan(/[ \t\r\n\f\v]+/)) != null) {
      return this.action(() => ["S", text!]);
    }
    if ((text = this._ss.scan(new RegExp(`(${string('"')}|${string("'")})`))) != null) {
      return this.action(() => ["STRING", text!]);
    }
    if ((text = this._ss.scan(/[^\n]/)) != null) {
      return this.action(() => [text!, text!]);
    }
    text = this._ss.string.slice(this._ss.pos);
    throw new ScanError(`can not match: '${text}'`);
  }
}
