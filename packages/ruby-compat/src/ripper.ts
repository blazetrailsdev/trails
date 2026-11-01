const EXPR_BEG = 0;
const EXPR_END = 1;
const EXPR_ARG = 2;
const EXPR_FNAME = 3;
const EXPR_DOT = 4;
const EXPR_CLASS = 5;
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
const BLOCK_OPEN = /\s*\|/y;
const LAMBDA_OPEN = /->\s*(\(?)/y;
const DEF_HEAD = new RegExp(
  `\\s*(?:${IDENT}\\.)?(?:${IDENT}[?!=]?|${OPERATOR})(\\(|[ \\t]+(?=[A-Za-z_*&]))?`,
  "y",
);
const LAMBDA_DO = /do\b/y;
const PATTERN_LITERAL = /"[^"]*"|'[^']*'|(?<!\w):\w+/g;
const PATTERN_KEY = /\w+:(?=\s*[^\s,})])/g;
const IN_PATTERN = /[^\n]*?(?=\bthen\b|\bif\b|\bunless\b|;|$)/my;
const FOR_VARS = /([^\n]*?)\bin\b/y;
const RESCUE_VAR = new RegExp(`[^\\n]*?=>\\s*(${IDENT})`, "y");
const ASSIGNMENT = new RegExp(
  `^(?:\\s*,\\s*\\*?${IDENT})*\\s*(?:\\|\\||&&|\\*\\*|<<|>>|[-+*/%|&^])?=(?![=~>])`,
);
const NAMED_CAPTURE = /\(\?<(\w+)>/g;
const REGEXP_FLAGS = /[a-z]*/y;
const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
const VALUE_KEYWORDS = new Set(["end", "self", "true", "false", "nil", "__FILE__", "__LINE__"]);
const OPERATOR_KEYWORDS = new Set(
  "for if unless while until and or not return when case then do else elsif begin ensure rescue in yield break next defined? module".split(
    " ",
  ),
);

/**
 * `Ripper` (`vendor/ruby/v3.3.11/ext/ripper/lib/ripper/core.rb:14`), reduced to
 * the lexer states of `parser_yylex` (`vendor/ruby/v3.3.11/parse.y:10420`) that
 * decide where a literal starts. Its comment event mirrors the Prism arm of
 * `ParserExtractor#annotations`: the value is `comment.location.slice`, so it
 * has no trailing newline, and an `=begin` block is one comment.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Ripper {
  private _src: string;
  private _pos = 0;
  private _line = 1;
  private _counted = 0;
  private _error = false;
  private _state = EXPR_BEG;
  private _forIn = false;
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
   * @noRailsEquivalent CONVERGEABLE ripper-reports-syntax-errors-beyond-unterminated-literals
   */
  isError(): boolean {
    return this._error;
  }

  /**
   * The `comment` scanner event (`vendor/ruby/v3.3.11/ext/ripper/eventids2.c:280`).
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
    if (this._pending.length > 0) this._error = true;
  }

  private _match(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this._pos;
    return re.exec(this._src);
  }

  private _localVars(text: string): void {
    for (const [name] of text.matchAll(new RegExp(IDENT, "g"))) {
      if (!/^[A-Z]/.test(name)) this._locals.add(name);
    }
  }

  private _paramList(start: number, close: string): void {
    const src = this._src;
    let depth = 0;
    let destructuring = 0;
    let expected = true;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (depth === 0 && destructuring === 0 && c === close) return;
      if (depth === 0 && close === "\n" && c === ";") return;
      LAMBDA_DO.lastIndex = i;
      if (depth === 0 && close === "{" && LAMBDA_DO.test(src)) return;
      if (c === "#") {
        const eol = src.indexOf("\n", i);
        if (eol === -1) return;
        i = eol - 1;
        continue;
      }
      if (c === '"' || c === "'") {
        for (i += 1; i < src.length && src[i] !== c; i++) {
          if (src[i] === "\\") i += 1;
        }
        continue;
      }
      WORD.lastIndex = i;
      const word = expected && depth === 0 ? WORD.exec(src) : null;
      if (word) {
        this._locals.add(word[0]);
        i += word[0].length - 1;
        expected = false;
      } else if (c === "(" && expected && depth === 0) {
        destructuring += 1;
      } else if (c === ")" && depth === 0 && destructuring > 0) {
        destructuring -= 1;
      } else if ("([{".includes(c)) {
        depth += 1;
      } else if (")]}".includes(c)) {
        depth -= 1;
        if (depth < 0) return;
      } else if (depth === 0 && (c === "," || c === ";")) {
        expected = true;
      }
    }
  }

  private _blockParams(): void {
    const m = this._match(BLOCK_OPEN);
    if (m) this._paramList(this._pos + m[0].length, "|");
  }

  private _code(interpolated: boolean): void {
    const src = this._src;
    let depth = 0;
    if (interpolated) this._state = EXPR_BEG;
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
      const state = this._state;
      const fname = state === EXPR_FNAME || state === EXPR_DOT;
      const argument = state === EXPR_ARG && spaced && next !== undefined && !/[\s=]/.test(next);
      const literal = state === EXPR_BEG || state === EXPR_CLASS || argument;
      if (c === "\n") {
        this._pos += 1;
        if (this._pending.length > 0) this._hereDocument();
        if (!fname) this._state = EXPR_BEG;
      } else if (c === " " || c === "\t" || c === "\r") {
        this._pos += 1;
      } else if (c === "\\" && next === "\n") {
        this._pos += 2;
        if (this._pending.length > 0) this._hereDocument();
      } else if (c === "#") {
        let eol = src.indexOf("\n", pos);
        if (eol === -1) eol = src.length;
        this._comment(pos, eol);
      } else if (fname && this._match(FNAME_OPERATOR)) {
        this._pos += this._match(FNAME_OPERATOR)![0].length;
        this._state = EXPR_END;
      } else if (c === '"' || c === "`") {
        this._pos += 1;
        this._literal(c, null, true);
        this._state = EXPR_END;
      } else if (c === "'") {
        this._pos += 1;
        this._literal(c, null, false);
        this._state = EXPR_END;
      } else if (c === ":") {
        this._colon();
      } else if (c === "?") {
        const character = state === EXPR_END ? null : this._match(CHARACTER);
        this._pos += character ? character[0].length : 1;
        this._state = character ? EXPR_END : EXPR_BEG;
      } else if (c === "/" && literal) {
        this._pos += 1;
        this._literal("/", null, true);
        if (/^\s*=~/.test(src.slice(this._pos, this._pos + 40))) {
          for (const [, name] of src.slice(pos, this._pos).matchAll(NAMED_CAPTURE)) {
            this._locals.add(name);
          }
        }
        this._pos += this._match(REGEXP_FLAGS)![0].length;
        this._state = EXPR_END;
      } else if (c === "%" && literal && this._match(PERCENT)) {
        this._parsePercent();
      } else if (c === "<" && state !== EXPR_CLASS && literal && this._match(HEREDOC)) {
        const m = this._match(HEREDOC)!;
        this._pos += m[0].length;
        const id = m[2] ?? m[3] ?? m[4] ?? m[5];
        this._pending.push({ id, indent: m[1] !== "", raw: m[3] !== undefined });
        this._state = EXPR_END;
      } else if (this._match(WORD)) {
        this._parseIdent();
      } else if (this._match(VARIABLE)) {
        this._pos += this._match(VARIABLE)![0].length;
        this._state = EXPR_END;
      } else if (this._match(NUMBER)) {
        this._pos += this._match(NUMBER)![0].length;
        this._state = EXPR_END;
      } else if (c === ".") {
        const range = next === ".";
        this._pos += range ? 2 : 1;
        this._state = range ? EXPR_BEG : EXPR_DOT;
      } else if (c === "&" && next === ".") {
        this._pos += 2;
        this._state = EXPR_DOT;
      } else if (c === "}" && interpolated && depth === 0) {
        this._pos += 1;
        return;
      } else if (c === ")" || c === "]" || c === "}") {
        if (c === "}") depth -= 1;
        this._pos += 1;
        this._state = EXPR_END;
      } else {
        if (c === "{") depth += 1;
        if (c === "-") {
          const lambda = this._match(LAMBDA_OPEN);
          if (lambda) this._paramList(pos + lambda[0].length, lambda[1] ? ")" : "{");
        }
        this._pos += 1;
        this._state = EXPR_BEG;
        if (c === "{") this._blockParams();
      }
    }
    if (interpolated) this._error = true;
  }

  private _comment(start: number, end: number): void {
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
    const end = Math.min(start + m.index + m[0].length + 1, this._src.length);
    this._comment(start, end);
  }

  private _colon(): void {
    if (this._src[this._pos + 1] === ":") {
      this._pos += 2;
      this._state = EXPR_DOT;
      return;
    }
    const quote = this._src[this._pos + 1];
    if (quote === '"' || quote === "'") {
      this._pos += 2;
      this._literal(quote, null, quote === '"');
      this._state = EXPR_END;
      return;
    }
    const symbol = this._match(SYMBOL);
    this._pos += symbol ? symbol[0].length : 1;
    this._state = symbol ? EXPR_END : EXPR_BEG;
  }

  private _parseIdent(): void {
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
    const state = this._state;
    const fname = state === EXPR_FNAME || state === EXPR_DOT;
    if (src[this._pos] === ":" && src[this._pos + 1] !== ":" && !fname) {
      this._pos += 1;
      this._state = EXPR_BEG;
    } else if (fname) {
      this._state = state === EXPR_FNAME ? EXPR_END : EXPR_ARG;
    } else if (name === "def") {
      this._state = EXPR_FNAME;
      this._locals = new Set();
      const head = this._match(DEF_HEAD);
      if (head?.[1]) this._paramList(this._pos + head[0].length, head[1] === "(" ? ")" : "\n");
    } else if (name === "class") {
      this._state = EXPR_CLASS;
    } else if (VALUE_KEYWORDS.has(name)) {
      this._state = EXPR_END;
    } else if (OPERATOR_KEYWORDS.has(name)) {
      this._state = EXPR_BEG;
      if (name === "do") this._blockParams();
      const vars = name === "for" ? this._match(FOR_VARS) : null;
      if (vars) {
        this._localVars(vars[1]);
        this._pos += vars[1].length;
        this._forIn = true;
      } else if (name === "in" && this._forIn) {
        this._forIn = false;
      } else if (name === "in") {
        this._localVars(
          this._match(IN_PATTERN)![0].replace(PATTERN_LITERAL, "").replace(PATTERN_KEY, ""),
        );
      }
      const rescued = name === "rescue" ? this._match(RESCUE_VAR) : null;
      if (rescued) this._localVars(rescued[1]);
    } else {
      const eol = src.indexOf("\n", this._pos);
      if (ASSIGNMENT.test(src.slice(this._pos, eol === -1 ? src.length : eol))) {
        this._locals.add(name);
      }
      this._state = this._locals.has(name) || /^_[1-9]$/.test(name) ? EXPR_END : EXPR_ARG;
    }
  }

  private _parsePercent(): void {
    const [text, type, open] = this._match(PERCENT)!;
    this._pos += text.length;
    const close = CLOSERS[open] ?? open;
    this._literal(close, close === open ? null : open, !"qwis".includes(type || "Q"));
    if (type === "r") this._pos += this._match(REGEXP_FLAGS)![0].length;
    this._state = EXPR_END;
  }

  private _literal(close: string, open: string | null, interpolated: boolean): void {
    const src = this._src;
    let nest = 0;
    while (this._pos < src.length && !this._error) {
      const c = src[this._pos];
      if (c === "\n" && this._pending.length > 0) {
        this._pos += 1;
        this._hereDocument();
      } else if (c === "\\" && src[this._pos + 1] === "\n" && this._pending.length > 0) {
        this._pos += 1;
      } else if (c === "\\") {
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

  private _hereDocument(): void {
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
        if (this._pending.length > 0) this._hereDocument();
      }
    }
  }
}
