import { isBlank } from "@blazetrails/activesupport";
import { isSymbol, symbolToS } from "@blazetrails/ruby-compat";

const SYMBOLS: readonly string[] = [":html", ":text", ":js", ":css", ":xml", ":json"];

export class SimpleType {
  static symbols(): readonly string[] {
    return SYMBOLS;
  }

  static get(type: string | SimpleType): SimpleType {
    if (type instanceof this) {
      return type;
    } else {
      return new this(type);
    }
  }

  /** @internal */
  static isValidSymbols(symbols: readonly unknown[]): boolean {
    return symbols.every((s) => SYMBOLS.includes(s as string));
  }

  readonly symbol: string;

  constructor(symbol: string) {
    this.symbol = isSymbol(symbol) ? symbol : `:${symbol}`;
  }

  toString(): string {
    return symbolToS(this.symbol);
  }

  ref(): string {
    return this.symbol;
  }

  toSym(): string {
    return this.ref();
  }

  equals(type: unknown): boolean | undefined {
    if (!isBlank(type)) {
      const sym = type instanceof SimpleType ? type.toSym() : String(type);
      return this.symbol === (isSymbol(sym) ? sym : `:${sym}`);
    }
  }
}
