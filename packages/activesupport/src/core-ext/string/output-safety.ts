/**
 * SafeBuffer — HTML-safe string wrapper.
 * Mirrors Rails ActiveSupport::SafeBuffer and ERB::Util.
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

/**
 * htmlEscape — escapes HTML special characters and returns a SafeBuffer.
 * Mirrors ERB::Util.html_escape.
 */
export function htmlEscape(value: unknown): SafeBuffer {
  if (value instanceof SafeBuffer) return value;
  const str = String(value ?? "");
  const escaped = str.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
  return new SafeBuffer(escaped, true);
}

/**
 * htmlEscapeOnce — escapes HTML entities but does not double-escape already-escaped sequences.
 */
export function htmlEscapeOnce(str: string): SafeBuffer {
  const escaped = str.replace(
    /&(?!amp;|lt;|gt;|quot;|#39;|#[xX][0-9a-fA-F]+;|#\d+;)|[<>"']/g,
    (c) => (c === "&" ? "&amp;" : HTML_ESCAPE[c]),
  );
  return new SafeBuffer(escaped, true);
}

/**
 * xmlNameEscape — escapes characters that are unsafe in XML element/attribute names.
 * Based on the XML 1.0 Name production: https://www.w3.org/TR/REC-xml/#NT-Name
 * Start chars: @:A-Za-z_ and BMP Unicode ranges (note: '@' is an intentional
 * extension to support framework-style attributes like "@click", matching Rails)
 * Following chars: same + -.0-9 and more Unicode ranges
 * Note: supplementary-plane code points (U+10000+) are not handled and will
 * be replaced with '_'. This covers all practical HTML/XML attribute names.
 */
/* eslint-disable no-misleading-character-class -- XML spec character ranges */
const XML_NAME_START =
  /[@:A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
const XML_NAME_FOLLOWING =
  /[@:A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\xB7\u0300-\u036F\u203F-\u2040]/;
/* eslint-enable no-misleading-character-class */

export function xmlNameEscape(name: string): string {
  if (!name || name.length === 0) return "";

  const codePoints = [...name];
  const chars: string[] = [XML_NAME_START.test(codePoints[0]) ? codePoints[0] : "_"];
  for (let i = 1; i < codePoints.length; i++) {
    chars.push(XML_NAME_FOLLOWING.test(codePoints[i]) ? codePoints[i] : "_");
  }
  return chars.join("");
}

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
  concat(other: string | SafeBuffer): SafeBuffer {
    if (!this._safe) {
      // If this buffer is not safe, just append as-is
      const otherStr = other instanceof SafeBuffer ? other.toString() : String(other);
      return new SafeBuffer(this._value + otherStr, false);
    }

    if (other instanceof SafeBuffer) {
      if (other.htmlSafe) {
        return new SafeBuffer(this._value + other.toString(), true);
      } else {
        // Escape unsafe buffer
        const escaped = other.toString().replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
        return new SafeBuffer(this._value + escaped, true);
      }
    }

    // Escape raw string before appending to safe buffer
    const escaped = String(other).replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
    return new SafeBuffer(this._value + escaped, true);
  }

  /** safeConcat — appends without escaping. Raises if this buffer is not safe. */
  safeConcat(other: string | SafeBuffer): SafeBuffer {
    if (!this._safe) {
      throw new SafeConcatError();
    }
    const otherStr = other instanceof SafeBuffer ? other.toString() : String(other);
    return new SafeBuffer(this._value + otherStr, true);
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

  valueOf(): string {
    return this._value;
  }

  /** chr — returns first character as a SafeBuffer with same safety. */
  chr(): SafeBuffer {
    const first = Array.from(this._value)[0] ?? "";
    return new SafeBuffer(first, this._safe);
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
 * isHtmlSafe — returns true if value is a SafeBuffer marked safe.
 */
export function isHtmlSafe(value: unknown): boolean {
  return value instanceof SafeBuffer && value.htmlSafe;
}
