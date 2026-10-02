import { PlainString } from "./plain-string.js";
import { Range, rbModConstSet } from "@blazetrails/ruby-compat";
import { Collectors } from "../namespaces.js";

export class SQLString extends PlainString {
  preparable?: boolean;
  retryable?: boolean;
  private bindIndex = 1;

  constructor() {
    super();
  }

  addBind(bind: unknown, block: (index: number) => string): this {
    this.append(block(this.bindIndex));
    this.bindIndex++;
    return this;
  }

  addBinds(
    binds: unknown[],
    _procForBinds: ((v: unknown) => unknown) | null | undefined,
    block: (index: number) => string,
  ): this {
    this.append(
      new Range(this.bindIndex, (this.bindIndex += binds.length), true).map(block).join(", "),
    );
    return this;
  }
}

rbModConstSet(Collectors, "SQLString", SQLString);
