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

export class SafeBuffer {
  private _value: string;
  private readonly _safe: boolean;

  constructor(value: string = "", safe: boolean = false) {
    this._value = value;
    this._safe = safe;
  }

  get htmlSafe(): boolean {
    return this._safe;
  }

  toString(): string {
    return this._value;
  }

  concat(value: string | SafeBuffer): SafeBuffer {
    if (!this._safe) {
      const valueStr = value instanceof SafeBuffer ? value.toString() : String(value);
      return new SafeBuffer(this._value + valueStr, false);
    }

    if (value instanceof SafeBuffer) {
      if (value.htmlSafe) {
        return new SafeBuffer(this._value + value.toString(), true);
      } else {
        const escaped = value.toString().replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
        return new SafeBuffer(this._value + escaped, true);
      }
    }

    const escaped = String(value).replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
    return new SafeBuffer(this._value + escaped, true);
  }

  safeConcat(value: string | SafeBuffer): SafeBuffer {
    if (!isHtmlSafe(this)) {
      throw new SafeConcatError();
    }
    const valueStr = value instanceof SafeBuffer ? value.toString() : String(value);
    return new SafeBuffer(this._value + valueStr, true);
  }

  htmlSafeBuffer(): SafeBuffer {
    return new SafeBuffer(this._value, true);
  }

  slice(start: number, end?: number): SafeBuffer {
    return new SafeBuffer(
      end !== undefined ? this._value.slice(start, end) : this._value.slice(start),
      this._safe,
    );
  }

  get length(): number {
    return this._value.length;
  }

  /** @noRailsEquivalent PERMANENT */
  valueOf(): string {
    return this._value;
  }

  chr(): SafeBuffer {
    const first = Array.from(this._value)[0] ?? "";
    return new SafeBuffer(first, isHtmlSafe(this));
  }

  repeat(count: number): SafeBuffer {
    return new SafeBuffer(this._value.repeat(count), this._safe);
  }

  set(index: number, value: string, length?: number): void {
    const escaped = this._safe ? value.replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]) : value;
    const len = length ?? 1;
    this._value = this._value.slice(0, index) + escaped + this._value.slice(index + len);
  }

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

export function htmlSafe(str: string): SafeBuffer {
  return new SafeBuffer(str, true);
}

export function isHtmlSafe(value: unknown): boolean {
  if (value instanceof SafeBuffer) return value.htmlSafe;
  if (value !== null && typeof value === "object" && "htmlSafe" in value) {
    return (value as { htmlSafe: unknown }).htmlSafe === true;
  }
  return false;
}
