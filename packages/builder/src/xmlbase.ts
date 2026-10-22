import {
  ArgumentError,
  Encoding,
  PROTOCOL_PROBES,
  RuntimeError,
  StandardError,
  encode,
  isPlainHash,
  isSymbol,
  rbBlockGivenP,
  rbObjAsString,
  rbObjSingletonClass,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { XChar } from "./xchar.js";

export class IllegalBlockError extends RuntimeError {}

export type Target = string | { append(text: string): unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class XmlBase {
  static cacheMethodCalls: boolean;

  protected _indent_: number;
  protected _level: number;
  protected _encoding: string;
  protected _explicitNilHandling: unknown;
  declare protected _target: Target;

  constructor(indent = 0, initial = 0, encoding = "utf-8") {
    this._indent_ = indent;
    this._level = initial;
    this._encoding = encoding.toLowerCase();
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || prop in target || PROTOCOL_PROBES.has(prop)) {
          return Reflect.get(target, prop, receiver);
        }
        return (...args: unknown[]) => receiver.methodMissing(stringToSym(prop), ...args);
      },
    });
  }

  isExplicitNilHandling(): unknown {
    return this._explicitNilHandling;
  }

  tagBang(sym: string, ...args: unknown[]): Target {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (xml: XmlBase) => unknown) : null;
    let text: string | null = null;
    let attrs: Record<string, unknown> | null = null;
    if (isSymbol(args[0]))
      sym = `${isSymbol(sym) ? symbolToS(sym) : sym}:${symbolToS(args.shift() as string)}`;
    if (!isSymbol(sym)) sym = stringToSym(sym);
    for (const arg of args) {
      if (isPlainHash(arg)) {
        attrs ??= {};
        Object.assign(attrs, arg);
      } else if (arg == null) {
        attrs ??= {};
        if (this.isExplicitNilHandling()) Object.assign(attrs, { nil: true });
      } else {
        text ??= "";
        text += isSymbol(arg) ? symbolToS(arg) : rbObjAsString(arg);
      }
    }
    if (block) {
      if (text != null) {
        throw new ArgumentError("XmlMarkup cannot mix a text argument with a block");
      }
      this._indent();
      this._startTag(sym, attrs);
      this._newline();
      try {
        this._nestedStructures(block);
      } finally {
        this._indent();
        this._endTag(sym);
        this._newline();
      }
    } else if (text == null) {
      this._indent();
      this._startTag(sym, attrs, true);
      this._newline();
    } else {
      this._indent();
      this._startTag(sym, attrs);
      this.textBang(text);
      this._endTag(sym);
      this._newline();
    }
    return this._target;
  }

  methodMissing(sym: string, ...args: unknown[]): Target {
    if (XmlBase.cacheMethodCalls) this.cacheMethodCall(sym);
    return this.tagBang(sym, ...args);
  }

  textBang(text: string): unknown {
    return this._text(this._escape(text));
  }

  append(text: string): unknown {
    return this._text(text);
  }

  isNil(): boolean {
    return false;
  }

  /** @internal */
  protected abstract _text(text: string): unknown;
  /** @internal */
  protected abstract _startTag(
    sym: string,
    attrs: Record<string, unknown> | null,
    endToo?: boolean,
  ): void;
  /** @internal */
  protected abstract _endTag(sym: string): void;

  /**
   * @internal
   * @missingRailsCall dummy? — CONVERGEABLE port-builder-xml-events-and-remaining-tests
   */
  protected _escape(text: string): string {
    const result = XChar.encode(text);
    try {
      const encoding = Encoding.find(this._encoding)!;
      const encoded = encode(result, encoding);
      return typeof encoded === "string" ? encoded : new TextDecoder("latin1").decode(encoded);
    } catch (e) {
      if (!(e instanceof StandardError)) throw e;
      // eslint-disable-next-line no-control-regex
      return result.replace(/[^\u0000-\u007F]/gu, (c) => `&#${c.codePointAt(0)};`);
    }
  }

  /** @internal */
  protected _escapeAttribute(text: string): string {
    return this._escape(text)
      .replaceAll("\n", "&#10;")
      .replaceAll("\r", "&#13;")
      .replaceAll('"', "&quot;");
  }

  /** @internal */
  protected _newline(): void {
    if (this._indent_ === 0) return;
    this.textBang("\n");
  }

  /** @internal */
  protected _indent(): void {
    if (this._indent_ === 0 || this._level === 0) return;
    this.textBang(" ".repeat(this._level * this._indent_));
  }

  /** @internal */
  protected _nestedStructures(block: (xml: XmlBase) => unknown): void {
    this._level += 1;
    try {
      block.call(this, this);
    } finally {
      this._level -= 1;
    }
  }

  /** @internal */
  private cacheMethodCall(sym: string): void {
    const klass = rbObjSingletonClass(this);
    const name = symbolToS(sym);
    if (!(name in klass.prototype)) {
      Object.defineProperty(klass.prototype, name, {
        value: function (this: XmlBase, ...args: unknown[]) {
          return this.tagBang(sym, ...args);
        },
        writable: true,
        configurable: true,
      });
    }
  }
}

XmlBase.cacheMethodCalls = true;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface XmlBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [tag: string]: any;
}
