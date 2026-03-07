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
  const escaped = str.replace(/&(?!amp;|lt;|gt;|quot;|#39;)|[<>"']/g, (c) =>
    c === "&" ? "&amp;" : HTML_ESCAPE[c]
  );
  return new SafeBuffer(escaped, true);
}

/**
 * xmlNameEscape — escapes characters that are unsafe in XML element/attribute names.
 */
export function xmlNameEscape(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-.:]/g, "_");
}

/**
 * SafeBuffer — a string that is marked as HTML safe.
 * Safe strings can be concatenated without escaping; unsafe strings are escaped when added.
 */
export class SafeBuffer {
  private readonly _value: string;
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
      const otherStr =
        other instanceof SafeBuffer ? other.toString() : String(other);
      return new SafeBuffer(this._value + otherStr, false);
    }

    if (other instanceof SafeBuffer) {
      if (other.htmlSafe) {
        return new SafeBuffer(this._value + other.toString(), true);
      } else {
        // Escape unsafe buffer
        const escaped = other
          .toString()
          .replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
        return new SafeBuffer(this._value + escaped, true);
      }
    }

    // Escape raw string before appending to safe buffer
    const escaped = String(other).replace(
      HTML_ESCAPE_PATTERN,
      (c) => HTML_ESCAPE[c]
    );
    return new SafeBuffer(this._value + escaped, true);
  }

  /** safeConcat — appends without escaping. Raises if this buffer is not safe. */
  safeConcat(other: string | SafeBuffer): SafeBuffer {
    if (!this._safe) {
      throw new Error("Safe concat called on unsafe buffer");
    }
    const otherStr =
      other instanceof SafeBuffer ? other.toString() : String(other);
    return new SafeBuffer(this._value + otherStr, true);
  }

  /** Returns a new SafeBuffer that is marked as safe. */
  htmlSafeBuffer(): SafeBuffer {
    return new SafeBuffer(this._value, true);
  }

  /** slice — returns a substring as a SafeBuffer with same safety. */
  slice(start: number, end?: number): SafeBuffer {
    return new SafeBuffer(
      end !== undefined
        ? this._value.slice(start, end)
        : this._value.slice(start),
      this._safe
    );
  }

  /** length / size */
  get length(): number {
    return this._value.length;
  }

  valueOf(): string {
    return this._value;
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
