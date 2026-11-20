import {
  ArgumentError,
  FrozenError,
  rbInspect,
  rbFCaller,
  rbFSend,
  rbObjClassname,
  TypeError,
  warn,
} from "@blazetrails/ruby-compat";
import { PG } from "./namespaces.js";

function _rbCheckFrozen(obj: object): void {
  if (Object.isFrozen(obj)) {
    throw new FrozenError(`can't modify frozen ${rbObjClassname(obj)}: ${rbInspect(obj)}`, {
      receiver: obj,
    });
  }
}

export class Coder {
  static readonly FORMAT_ERROR_MASK = 0xc;
  static readonly FORMAT_ERROR_TO_RAISE = 0x4;
  static readonly FORMAT_ERROR_TO_STRING = 0x8;
  static readonly FORMAT_ERROR_TO_PARTIAL = 0xc;
  static readonly TIMESTAMP_DB_UTC = 0x0;
  static readonly TIMESTAMP_DB_LOCAL = 0x1;
  static readonly TIMESTAMP_APP_UTC = 0x0;
  static readonly TIMESTAMP_APP_LOCAL = 0x2;

  #oid = 0;
  #format = 0;
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

  set oid(oid: number) {
    _rbCheckFrozen(this);
    this.#oid = oid;
  }

  get oid(): number {
    return this.#oid;
  }

  set format(format: number) {
    _rbCheckFrozen(this);
    this.#format = format;
  }

  get format(): number {
    return this.#format;
  }

  set flags(flags: number) {
    _rbCheckFrozen(this);
    this.#flags = flags;
  }

  get flags(): number {
    return this.#flags;
  }

  get name(): string | null {
    return this.#name;
  }

  set name(value: string | null) {
    _rbCheckFrozen(this);
    this.#name = value;
  }

  toH(): { oid: number; format: number; flags: number; name: string | null } {
    return {
      oid: this.oid,
      format: this.format,
      flags: this.flags,
      name: this.name,
    };
  }
}

export class CompositeCoder extends Coder {
  declare private _elem: Coder | null | undefined;
  declare private _needsQuotation: boolean | undefined;
  declare private _delimiter: string | undefined;

  set elementsType(elemType: Coder | null) {
    _rbCheckFrozen(this);
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
    _rbCheckFrozen(this);
    this._needsQuotation = needsQuotation != null && needsQuotation !== false;
  }

  isNeedsQuotation(): boolean {
    return this._needsQuotation ?? true;
  }

  set delimiter(delimiter: string) {
    _rbCheckFrozen(this);
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

PG.Coder = Coder;
PG.CompositeCoder = CompositeCoder;
