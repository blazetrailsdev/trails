import { SafeBuffer, htmlEscape, htmlSafe, isHtmlSafe } from "@blazetrails/activesupport";

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

  toStr(): string {
    return this._raw;
  }

  get htmlSafe(): true {
    return true;
  }

  /** @deprecated */
  htmlSafeBuffer(): SafeBuffer {
    return this.toString();
  }

  append(value: unknown): this {
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

  safeAppend(value: unknown): this {
    if (value === null || value === undefined) {
      throw new TypeError("no implicit conversion of nil into String");
    }
    this._raw += value instanceof SafeBuffer ? value.toString() : String(value);
    return this;
  }

  /** @deprecated */
  concat(value: unknown): this {
    return this.append(value);
  }

  /** @deprecated */
  safeConcat(value: unknown): this {
    return this.safeAppend(value);
  }

  safeExprAppend(value: unknown): this {
    if (value === null || value === undefined) return this;
    this._raw += value instanceof SafeBuffer ? value.toString() : String(value);
    return this;
  }

  capture<TArgs extends unknown[]>(args: TArgs, fn: (...args: TArgs) => void): SafeBuffer {
    const saved = this._raw;
    this._raw = "";
    try {
      fn(...args);
      return htmlSafe(this._raw);
    } finally {
      this._raw = saved;
    }
  }

  equals(other: unknown): boolean {
    return other instanceof OutputBuffer && other.toStr() === this._raw;
  }

  raw(): RawOutputBuffer {
    return new RawOutputBuffer(this);
  }

  /** @internal */
  get rawBuffer(): string {
    return this._raw;
  }

  /** @internal */
  appendRaw(value: string): void {
    this._raw += value;
  }
}

export class RawOutputBuffer {
  constructor(private readonly buffer: OutputBuffer) {}

  append(value: unknown): this {
    if (value === null || value === undefined) return this;
    this.buffer.appendRaw(value instanceof SafeBuffer ? value.toString() : String(value));
    return this;
  }

  /** @deprecated */
  concat(value: unknown): this {
    return this.append(value);
  }

  raw(): this {
    return this;
  }
}

export class StreamingBuffer {
  private _block: (value: string) => void;

  constructor(block: (value: string) => void) {
    this._block = block;
  }

  get block(): (value: string) => void {
    return this._block;
  }

  append(value: unknown): this {
    const str = toRawString(value);
    const safe = isHtmlSafe(value) || value instanceof OutputBuffer;
    this._block(safe ? str : htmlEscape(str).toString());
    return this;
  }

  safeAppend(value: unknown): this {
    this._block(toRawString(value));
    return this;
  }

  /** @deprecated */
  concat(value: unknown): this {
    return this.append(value);
  }

  /** @deprecated */
  safeConcat(value: unknown): this {
    return this.safeAppend(value);
  }

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

  get htmlSafe(): true {
    return true;
  }

  raw(): RawStreamingBuffer {
    return new RawStreamingBuffer(this);
  }
}

export class RawStreamingBuffer {
  constructor(private readonly buffer: StreamingBuffer) {}

  append(value: unknown): this {
    if (value === null || value === undefined) return this;
    this.buffer.block(toRawString(value));
    return this;
  }

  /** @deprecated */
  concat(value: unknown): this {
    return this.append(value);
  }

  raw(): this {
    return this;
  }
}

function toRawString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof SafeBuffer) return value.toString();
  if (value instanceof OutputBuffer) return value.toStr();
  return String(value);
}
