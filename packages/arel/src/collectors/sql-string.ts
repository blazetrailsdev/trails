import { PlainString } from "./plain-string.js";

export class SQLString extends PlainString {
  preparable = false;
  retryable = true;
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
    const parts: string[] = [];
    for (let i = this.bindIndex; i < this.bindIndex + binds.length; i++) {
      parts.push(block(i));
    }
    this.bindIndex += binds.length;
    this.append(parts.join(", "));
    return this;
  }
}
