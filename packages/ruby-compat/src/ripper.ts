const IDENT = "[A-Za-z_\\u0080-\\uffff][\\w\\u0080-\\uffff]*";
const OPERATOR = "\\[\\]=?|\\*\\*|<=>|===?|=~|![=~]?|<<|>>|<=|>=|[+\\-]@|[+\\-*/%<>~^&|`!]";
const END_MARKER = /__END__(?:\r?\n|$)/y;
const EMBDOC_BEGIN = /=begin(?:\s|$)/y;
const EMBDOC_END = /^=end(?:[ \t].*)?$/m;
const WORD = new RegExp(IDENT, "y");
const FNAME_OPERATOR = new RegExp(OPERATOR, "y");
const SYMBOL = new RegExp(
  `:(?:${IDENT}(?:[?!]|=(?![>=~]))?|@@?\\w+|\\$\\w+|${OPERATOR})(?![:])`,
  "y",
);
const VARIABLE = /@@?\w+|\$(?:-\w|\w+|[^\s])/y;
const NUMBER = /\d\w*/y;
const CHARACTER = /\?(?:\\[\s\S]|[^\s\\])(?!\w)/y;
const PERCENT = /%([qQwWiIrsx]?)([^\w\s])/y;
const HEREDOC = new RegExp(
  `<<([~-]?)(?:"([^"\\n]+)"|'([^'\\n]+)'|\`([^\`\\n]+)\`|(${IDENT}))`,
  "y",
);
const REGEXP_FLAGS = /[a-z]*/y;
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
const VALUE_KEYWORDS = new Set(["end", "self", "true", "false", "nil", "__FILE__", "__LINE__"]);
const OPERATOR_KEYWORDS = new Set(
  "if unless while until and or not return when case then do else elsif begin ensure rescue in yield break next defined? module".split(
    " ",
  ),
);

/**
 * `Ripper` (`vendor/ruby/v3.3.11/ext/ripper/lib/ripper/core.rb:15`), reduced to
 * the lexer states of `parser_yylex` (`vendor/ruby/v3.3.11/parse.y:10411`) that
 * decide where a literal starts, so only the comment event fires. An `=begin`
 * block fires it too, as `Prism.parse_file`'s `comments` holds one.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Ripper {
  private _src: string;
  private _pos = 0;
  private _line = 1;
  private _counted = 0;
  private _error = false;
  private _beg = true;
  private _cmdarg = false;
  private _fname = false;
  private _def = false;
  private _class = false;
  private _pending: Array<{ id: string; indent: boolean; raw: boolean }> = [];
  private _locals = new Set<string>();

  /**
   * `ripper_initialize` (`vendor/ruby/v3.3.11/ext/ripper/ripper_init.c.tmpl:322`).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(src: string) {
    this._src = src;
  }

  /**
   * `ripper_lineno` (`vendor/ruby/v3.3.11/ext/ripper/ripper_init.c.tmpl:446`).
   *
   * @noRailsEquivalent PERMANENT
   */
  lineno(): number {
    for (; this._counted < this._pos; this._counted++) {
      if (this._src[this._counted] === "\n") this._line += 1;
    }
    return this._line;
  }

  /**
   * `ripper_error_p` (`vendor/ruby/v3.3.11/ext/ripper/ripper_init.c.tmpl:150`).
   * Only an unterminated literal is an error here.
   *
   * @noRailsEquivalent PERMANENT
   */
  isError(): boolean {
    return this._error;
  }

  /**
   * `Ripper#on_comment` (`vendor/ruby/v3.3.11/ext/ripper/lib/ripper/core.rb:15`).
   *
   * @noRailsEquivalent PERMANENT
   */
  onComment(_value: string): void {}

  /**
   * `ripper_parse` (`vendor/ruby/v3.3.11/ext/ripper/ripper_init.c.tmpl:388`).
   *
   * @noRailsEquivalent PERMANENT
   */
  parse(): void {
    this._code(false);
  }

  private _match(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this._pos;
    return re.exec(this._src);
  }

  private _value(cmdarg = false): void {
    this._beg = false;
    this._cmdarg = cmdarg;
    this._fname = false;
    this._def = false;
    this._class = false;
  }

  private _operator(): void {
    this._value();
    this._beg = true;
  }

  private _code(interpolated: boolean): void {
    const src = this._src;
    let depth = 0;
    if (interpolated) this._operator();
    while (this._pos < src.length && !this._error) {
      const pos = this._pos;
      const c = src[pos];
      if (pos === 0 || src[pos - 1] === "\n") {
        if (this._match(END_MARKER)) {
          this._pos = src.length;
          break;
        }
        if (this._match(EMBDOC_BEGIN)) {
          this._embdoc();
          continue;
        }
      }
      const next = src[pos + 1];
      const spaced = pos > 0 && /\s/.test(src[pos - 1]);
      const argument = this._cmdarg && spaced && next !== undefined && !/[\s=]/.test(next);
      const literal = !this._fname && (this._beg || argument);
      if (c === "\n") {
        this._pos += 1;
        if (this._pending.length > 0) this._heredocs();
        this._beg = true;
        this._cmdarg = false;
      } else if (c === " " || c === "\t" || c === "\r") {
        this._pos += 1;
      } else if (c === "\\" && next === "\n") {
        this._pos += 2;
      } else if (c === "#") {
        let eol = src.indexOf("\n", pos);
        if (eol === -1) eol = src.length;
        this._comment(pos, eol);
      } else if (this._fname && this._match(FNAME_OPERATOR)) {
        this._pos += this._match(FNAME_OPERATOR)![0].length;
        this._value();
      } else if (c === '"' || c === "`") {
        this._pos += 1;
        this._literal(c, null, true);
        this._value();
      } else if (c === "'") {
        this._pos += 1;
        this._literal(c, null, false);
        this._value();
      } else if (c === ":") {
        this._colon();
      } else if (c === "?") {
        const character = this._beg ? this._match(CHARACTER) : null;
        this._pos += character ? character[0].length : 1;
        if (character) this._value();
        else this._operator();
      } else if (c === "/" && literal) {
        this._pos += 1;
        this._literal("/", null, true);
        this._pos += this._match(REGEXP_FLAGS)![0].length;
        this._value();
      } else if (c === "%" && literal && this._match(PERCENT)) {
        this._percent();
      } else if (c === "<" && !this._class && literal && this._match(HEREDOC)) {
        const m = this._match(HEREDOC)!;
        this._pos += m[0].length;
        const id = m[2] ?? m[3] ?? m[4] ?? m[5];
        this._pending.push({ id, indent: m[1] !== "", raw: m[3] !== undefined });
        this._value();
      } else if (this._match(WORD)) {
        this._word();
      } else if (this._match(VARIABLE)) {
        this._pos += this._match(VARIABLE)![0].length;
        this._value();
      } else if (this._match(NUMBER)) {
        this._pos += this._match(NUMBER)![0].length;
        this._value();
      } else if (c === ".") {
        const range = next === ".";
        this._pos += range ? 2 : 1;
        if (range) this._operator();
        else this._fname = true;
      } else if (c === "&" && next === ".") {
        this._pos += 2;
        this._fname = true;
      } else if (c === "}" && interpolated && depth === 0) {
        this._pos += 1;
        return;
      } else if (c === ")" || c === "]" || c === "}") {
        if (c === "}") depth -= 1;
        this._pos += 1;
        this._value();
      } else {
        if (c === "{") depth += 1;
        this._pos += 1;
        this._operator();
      }
    }
    if (interpolated) this._error = true;
  }

  private _comment(start: number, end: number): void {
    this._pos = start;
    this.onComment(this._src.slice(start, end));
    this._pos = end;
  }

  private _embdoc(): void {
    const start = this._pos;
    const rest = this._src.slice(start);
    const m = EMBDOC_END.exec(rest);
    if (!m) {
      this._error = true;
      return;
    }
    const end = start + m.index + m[0].length;
    this._comment(start, end);
  }

  private _colon(): void {
    if (this._src[this._pos + 1] === ":") {
      this._pos += 2;
      this._fname = true;
      return;
    }
    const quote = this._src[this._pos + 1];
    if (quote === '"' || quote === "'") {
      this._pos += 2;
      this._literal(quote, null, quote === '"');
      this._value();
      return;
    }
    const symbol = this._match(SYMBOL);
    this._pos += symbol ? symbol[0].length : 1;
    if (symbol) this._value();
    else this._operator();
  }

  private _word(): void {
    const word = this._match(WORD)![0];
    this._pos += word.length;
    const src = this._src;
    const c = src[this._pos];
    const after = src[this._pos + 1];
    let name = word;
    if ((c === "?" || c === "!") && (after !== "=" || /[=~>]/.test(src[this._pos + 2] ?? ""))) {
      name += c;
      this._pos += 1;
    }
    const wasFname = this._fname;
    const wasDef = this._def;
    if (src[this._pos] === ":" && src[this._pos + 1] !== ":" && !wasFname) {
      this._pos += 1;
      this._operator();
    } else if (wasFname) {
      this._value(!wasDef);
    } else if (name === "def") {
      this._value();
      this._fname = true;
      this._def = true;
    } else if (name === "class") {
      this._operator();
      this._class = true;
    } else if (VALUE_KEYWORDS.has(name)) {
      this._value();
    } else if (OPERATOR_KEYWORDS.has(name)) {
      this._operator();
    } else {
      if (/^\s*=(?![=~>])/.test(src.slice(this._pos, this._pos + 40))) this._locals.add(name);
      this._value(!this._locals.has(name));
    }
  }

  private _percent(): void {
    const [text, type, open] = this._match(PERCENT)!;
    this._pos += text.length;
    const close = CLOSERS[open] ?? open;
    this._literal(close, close === open ? null : open, !"qwis".includes(type || "Q"));
    if (type === "r") this._pos += this._match(REGEXP_FLAGS)![0].length;
    this._value();
  }

  private _literal(close: string, open: string | null, interpolated: boolean): void {
    const src = this._src;
    let nest = 0;
    while (this._pos < src.length && !this._error) {
      const c = src[this._pos];
      if (c === "\\") {
        this._pos += 2;
      } else if (interpolated && c === "#" && src[this._pos + 1] === "{") {
        this._pos += 2;
        this._code(true);
      } else if (c === open) {
        nest += 1;
        this._pos += 1;
      } else if (c === close) {
        this._pos += 1;
        if (nest === 0) return;
        nest -= 1;
      } else {
        this._pos += 1;
      }
    }
    this._error = true;
  }

  private _heredocs(): void {
    const src = this._src;
    const pending = this._pending;
    this._pending = [];
    for (const { id, indent, raw } of pending) {
      for (;;) {
        if (this._pos >= src.length) {
          this._error = true;
          return;
        }
        let eol = src.indexOf("\n", this._pos);
        if (eol === -1) eol = src.length;
        const line = src.slice(this._pos, eol).replace(/\r$/, "");
        if ((indent ? line.trimStart() : line) === id) {
          this._pos = Math.min(eol + 1, src.length);
          break;
        }
        if (raw) {
          this._pos = eol + 1;
          continue;
        }
        while (this._pos < src.length && src[this._pos] !== "\n" && !this._error) {
          if (src[this._pos] === "\\") {
            this._pos += 2;
          } else if (src.startsWith("#{", this._pos)) {
            this._pos += 2;
            this._code(true);
          } else {
            this._pos += 1;
          }
        }
        if (this._error) return;
        this._pos += 1;
      }
    }
  }
}
