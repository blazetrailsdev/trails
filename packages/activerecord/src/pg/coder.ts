import {
  ArgumentError,
  rbFCaller,
  rbFSend,
  rbObjClassname,
  TypeError,
  warn,
} from "@blazetrails/ruby-compat";

export class Coder {
  static readonly FORMAT_ERROR_MASK = 0xc;
  static readonly FORMAT_ERROR_TO_RAISE = 0x4;
  static readonly FORMAT_ERROR_TO_STRING = 0x8;
  static readonly FORMAT_ERROR_TO_PARTIAL = 0xc;

  #flags = 0;
  #name: string | null = null;

  constructor(hash: Record<string, unknown> | null = null, kwargs: Record<string, unknown> = {}) {
    if (hash != null) {
      warn(
        `PG::Coder.new(hash) is deprecated. Please use keyword arguments instead! Called from ${rbFCaller()[0]}`,
        { category: ":deprecated" },
      );
    }

    for (const [key, val] of Object.entries(hash ?? kwargs)) {
      rbFSend(this, `${key}=`, val);
    }
  }

  set flags(flags: number) {
    this.#flags = flags;
  }

  get flags(): number {
    return this.#flags;
  }

  get name(): string | null {
    return this.#name;
  }

  set name(value: string | null) {
    this.#name = value;
  }
}

export class CompositeCoder extends Coder {
  declare private _elem: Coder | null | undefined;
  declare private _needsQuotation: boolean | undefined;
  declare private _delimiter: string | undefined;

  set elementsType(elemType: Coder | null) {
    if (elemType != null && !(elemType instanceof Coder)) {
      throw new TypeError(
        `wrong elements type ${rbObjClassname(elemType)} (expected some kind of PG::Coder)`,
      );
    }
    this._elem = elemType;
  }

  get elementsType(): Coder | null {
    return this._elem ?? null;
  }

  setNeedsQuotation(needsQuotation: unknown): void {
    this._needsQuotation = needsQuotation != null && needsQuotation !== false;
  }

  isNeedsQuotation(): boolean {
    return this._needsQuotation ?? true;
  }

  set delimiter(delimiter: string) {
    if (typeof delimiter !== "string") {
      throw new TypeError(`no implicit conversion of ${rbObjClassname(delimiter)} into String`);
    }
    if (delimiter.length !== 1) throw new ArgumentError("delimiter size must be one byte");
    this._delimiter = delimiter;
  }

  get delimiter(): string {
    return this._delimiter ?? ",";
  }
}
