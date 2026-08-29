/**
 * SafeBuffer — HTML-safe string wrapper.
 * Mirrors Rails ActiveSupport::SafeBuffer. The escape table below is the
 * stand-in for CGI.escapeHTML that Rails' SafeBuffer interpolation uses;
 * ERB::Util's own table lives in core-ext/tse/util.ts.
 *
 * A SafeBuffer wraps a string and marks it as "HTML safe". When unsafe strings
 * are concatenated to a SafeBuffer, they are HTML-escaped first.
 */

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

export class SafeConcatError extends Error {
  constructor() {
    super("Could not concatenate to the buffer because it is not HTML safe.");
    this.name = "SafeConcatError";
  }
}

/**
 * SafeBuffer — a string that is marked as HTML safe.
 * Safe strings can be concatenated without escaping; unsafe strings are escaped when added.
 */
export class SafeBuffer {
  private _value: string;
  private readonly _safe: boolean;

  constructor(value: string = "", safe: boolean = false) {
    this._value = value;
    this._safe = safe;
  }

  /** Returns whether this buffer is marked as HTML safe. */
  get htmlSafe(): boolean {
    return this._safe;
  }

  /** Returns the underlying string value. */
  toString(): string {
    return this._value;
  }

  /** concat — appends another string/SafeBuffer. Unsafe strings are escaped. */
  concat(value: string | SafeBuffer): SafeBuffer {
    if (!this._safe) {
      // If this buffer is not safe, just append as-is
      const valueStr = value instanceof SafeBuffer ? value.toString() : String(value);
      return new SafeBuffer(this._value + valueStr, false);
    }

    if (value instanceof SafeBuffer) {
      if (value.htmlSafe) {
        return new SafeBuffer(this._value + value.toString(), true);
      } else {
        // Escape unsafe buffer
        const escaped = value.toString().replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
        return new SafeBuffer(this._value + escaped, true);
      }
    }

    // Escape raw string before appending to safe buffer
    const escaped = String(value).replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
    return new SafeBuffer(this._value + escaped, true);
  }

  /** safeConcat — appends without escaping. Raises if this buffer is not safe. */
  safeConcat(value: string | SafeBuffer): SafeBuffer {
    if (!isHtmlSafe(this)) {
      throw new SafeConcatError();
    }
    const valueStr = value instanceof SafeBuffer ? value.toString() : String(value);
    return new SafeBuffer(this._value + valueStr, true);
  }

  /** Returns a new SafeBuffer that is marked as safe. */
  htmlSafeBuffer(): SafeBuffer {
    return new SafeBuffer(this._value, true);
  }

  /** slice — returns a substring as a SafeBuffer with same safety. */
  slice(start: number, end?: number): SafeBuffer {
    return new SafeBuffer(
      end !== undefined ? this._value.slice(start, end) : this._value.slice(start),
      this._safe,
    );
  }

  /** length / size */
  get length(): number {
    return this._value.length;
  }

  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activesupport/lib/active_support/core_ext/string/output_safety.rb:138` — `def
   *   to_s` is the Ruby coercion hook).
   * JS primitive-coercion protocol — Ruby coerces through to_s/to_i instead
   */
  valueOf(): string {
    return this._value;
  }

  /** chr — returns first character as a SafeBuffer with same safety. */
  chr(): SafeBuffer {
    const first = Array.from(this._value)[0] ?? "";
    return new SafeBuffer(first, isHtmlSafe(this));
  }

  /** repeat — repeats the string n times, preserving safety status. */
  repeat(count: number): SafeBuffer {
    return new SafeBuffer(this._value.repeat(count), this._safe);
  }

  /** set — assigns a value at a given index or slice, escaping if safe. */
  set(index: number, value: string, length?: number): void {
    const escaped = this._safe ? value.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]) : value;
    const len = length ?? 1;
    this._value = this._value.slice(0, index) + escaped + this._value.slice(index + len);
  }

  /** format — sprintf-like interpolation, escaping unsafe args. Indices are UTF-16 code units. */
  format(args: Record<string, unknown> | unknown[]): SafeBuffer {
    let result: string;
    if (Array.isArray(args)) {
      let i = 0;
      result = this._value.replace(/%s/g, () => {
        if (i >= args.length) throw new Error("too few arguments");
        const arg = args[i++];
        if (arg instanceof SafeBuffer && arg.htmlSafe) return arg.toString();
        const str = arg instanceof SafeBuffer ? arg.toString() : String(arg);
        return this._safe ? str.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]) : str;
      });
    } else {
      result = this._value.replace(/%\{(\w+)\}/g, (_, key) => {
        if (!Object.hasOwn(args, key)) throw new Error(`key{${key}} not found`);
        const arg = args[key];
        if (arg instanceof SafeBuffer && arg.htmlSafe) return arg.toString();
        const str = arg instanceof SafeBuffer ? arg.toString() : String(arg);
        return this._safe ? str.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]) : str;
      });
    }
    return new SafeBuffer(result, this._safe);
  }
}

/**
 * htmlSafe — marks a string as HTML safe by wrapping in SafeBuffer.
 */
export function htmlSafe(str: string): SafeBuffer {
  return new SafeBuffer(str, true);
}

/**
 * isHtmlSafe — returns true if value is HTML safe.
 * Accepts SafeBuffer instances and any duck-typed object with `htmlSafe === true`
 * (e.g. ActionView::OutputBuffer, which mirrors Rails' OutputBuffer < SafeBuffer).
 */
export function isHtmlSafe(value: unknown): boolean {
  if (value instanceof SafeBuffer) return value.htmlSafe;
  if (value !== null && typeof value === "object" && "htmlSafe" in value) {
    return (value as { htmlSafe: unknown }).htmlSafe === true;
  }
  return false;
}
