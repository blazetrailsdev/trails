import { SafeBuffer, htmlEscape, htmlSafe, isHtmlSafe } from "@blazetrails/activesupport";

/**
 * OutputBuffer — wraps a string with `<<`-collecting semantics for ERB-style templates.
 *
 * Mirrors ActionView::OutputBuffer. Difference vs SafeBuffer: `<<` / `concat`
 * call `.toString()` on the input (so non-string values like numbers stringify
 * naturally) and skip nil/undefined values entirely.
 */
export class OutputBuffer {
  private _raw: string;

  constructor(buffer: string | SafeBuffer = "") {
    this._raw = buffer instanceof SafeBuffer ? buffer.toString() : String(buffer);
  }

  get length(): number {
    return this._raw.length;
  }

  isEmpty(): boolean {
    return this._raw.length === 0;
  }

  isBlank(): boolean {
    return /^\s*$/.test(this._raw);
  }

  toString(): SafeBuffer {
    return htmlSafe(this._raw);
  }

  /** Returns the raw, unescaped string. Mirrors Rails `to_str`. */
  toStr(): string {
    return this._raw;
  }

  htmlSafe(): SafeBuffer {
    return this.toString();
  }

  isHtmlSafe(): boolean {
    return true;
  }

  /** Append a value, escaping if not html-safe. Nil values are skipped. */
  concat(value: unknown): this {
    if (value === null || value === undefined) return this;
    if (isHtmlSafe(value)) {
      this._raw += (value as SafeBuffer).toString();
    } else if (value instanceof OutputBuffer) {
      this._raw += value.toStr();
    } else {
      this._raw += htmlEscape(value).toString();
    }
    return this;
  }

  /**
   * Append without escaping. Mirrors Rails `safe_concat` / `safe_append=`.
   * Unlike `safeExprAppend`, this does NOT skip nil — Rails raises TypeError
   * on `String#<<(nil)`, so we throw to match.
   */
  safeConcat(value: unknown): this {
    if (value === null || value === undefined) {
      throw new TypeError("no implicit conversion of nil into String");
    }
    this._raw += value instanceof SafeBuffer ? value.toString() : String(value);
    return this;
  }

  /** Mirrors Rails `safe_expr_append=` — like safe_concat but skips nil. */
  safeExprAppend(value: unknown): this {
    if (value === null || value === undefined) return this;
    this._raw += value instanceof SafeBuffer ? value.toString() : String(value);
    return this;
  }

  /**
   * Capture — swaps the buffer for the duration of `fn`, returns what was
   * appended as an HTML-safe string. Mirrors Rails `capture(*args, &block)`.
   */
  capture<TArgs extends unknown[]>(fn: (...args: TArgs) => void, ...args: TArgs): SafeBuffer {
    const previous = this._raw;
    this._raw = "";
    try {
      fn(...args);
      return htmlSafe(this._raw);
    } finally {
      this._raw = previous;
    }
  }

  equals(other: unknown): boolean {
    return other instanceof OutputBuffer && other.toStr() === this._raw;
  }

  raw(): RawOutputBuffer {
    return new RawOutputBuffer(this);
  }

  /** @internal Direct access to the underlying string, used by RawOutputBuffer. */
  get rawBuffer(): string {
    return this._raw;
  }

  /** @internal Used by RawOutputBuffer to append without escaping. */
  appendRaw(value: string): void {
    this._raw += value;
  }
}

/**
 * RawOutputBuffer — bypasses escaping when appending to an OutputBuffer.
 * Used by the template compiler for `<%== %>` raw-output expressions.
 */
export class RawOutputBuffer {
  constructor(private readonly buffer: OutputBuffer) {}

  concat(value: unknown): this {
    if (value === null || value === undefined) return this;
    this.buffer.appendRaw(value instanceof SafeBuffer ? value.toString() : String(value));
    return this;
  }

  raw(): this {
    return this;
  }
}

/**
 * StreamingBuffer — buffer that streams writes through a callback instead
 * of accumulating into a string. Mirrors ActionView::StreamingBuffer; used
 * by `render stream: true` to push chunks to the response as they're
 * produced.
 */
export class StreamingBuffer {
  private _block: (value: string) => void;

  constructor(block: (value: string) => void) {
    this._block = block;
  }

  /** The current chunk sink. Mirrors Rails `attr_reader :block`. */
  get block(): (value: string) => void {
    return this._block;
  }

  /**
   * Append a value, escaping if not html-safe. Mirrors Rails `<<` — unlike
   * `OutputBuffer`/`RawStreamingBuffer`, nil is NOT skipped: `nil.to_s`
   * produces `""`, which is still passed through to the block.
   */
  concat(value: unknown): this {
    const str = toRawString(value);
    const safe = isHtmlSafe(value) || value instanceof OutputBuffer;
    this._block(safe ? str : htmlEscape(str).toString());
    return this;
  }

  /**
   * Append without escaping. Mirrors Rails `safe_concat` / `safe_append=`,
   * which is `@block.call(value.to_s)` — `nil.to_s` is `""`, so nil flows
   * through as an empty chunk rather than the literal "null"/"undefined".
   */
  safeConcat(value: unknown): this {
    this._block(toRawString(value));
    return this;
  }

  /**
   * Swap the chunk sink for the duration of `fn`, returning everything it
   * appended as an HTML-safe string. Mirrors Rails `capture`.
   */
  capture(fn: () => void): SafeBuffer {
    let buffer = "";
    const previous = this._block;
    this._block = (value: string) => {
      buffer += value;
    };
    try {
      fn();
      return htmlSafe(buffer);
    } finally {
      this._block = previous;
    }
  }

  isHtmlSafe(): boolean {
    return true;
  }

  htmlSafe(): this {
    return this;
  }

  raw(): RawStreamingBuffer {
    return new RawStreamingBuffer(this);
  }
}

/**
 * RawStreamingBuffer — bypasses escaping when streaming through a
 * StreamingBuffer. Used by the template compiler for `<%== %>` in
 * streaming responses.
 */
export class RawStreamingBuffer {
  constructor(private readonly buffer: StreamingBuffer) {}

  concat(value: unknown): this {
    if (value === null || value === undefined) return this;
    this.buffer.block(toRawString(value));
    return this;
  }

  raw(): this {
    return this;
  }
}

/**
 * Stringify a value the way Rails `to_s` would for streaming/output
 * buffers: `nil → ""`, `SafeBuffer → underlying string`, `OutputBuffer →
 * underlying raw string` (avoids `String(outputBuffer)` throwing because
 * `OutputBuffer.toString()` returns a non-primitive `SafeBuffer`).
 */
function toRawString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof SafeBuffer) return value.toString();
  if (value instanceof OutputBuffer) return value.toStr();
  return String(value);
}
