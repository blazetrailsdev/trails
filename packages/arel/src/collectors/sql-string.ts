import { PlainString } from "./plain-string.js";

/**
 * SQLString collector — accumulates SQL fragments into a single string.
 *
 * Mirrors: Arel::Collectors::SQLString
 */
export class SQLString extends PlainString {
  preparable = false;
  retryable = true;
  private bindIndex = 1;

  constructor() {
    super();
  }

  addBind(bind: unknown, block?: (index: number) => string): this {
    if (block) {
      this.append(block(this.bindIndex));
    } else {
      this.append("?");
    }
    this.bindIndex++;
    return this;
  }

  addBinds(
    binds: unknown[],
    _procForBinds?: ((v: unknown) => unknown) | null,
    block?: (index: number) => string,
  ): this {
    if (block) {
      const parts: string[] = [];
      for (let i = this.bindIndex; i < this.bindIndex + binds.length; i++) {
        parts.push(block(i));
      }
      this.append(parts.join(", "));
    } else {
      this.append(binds.map(() => "?").join(", "));
    }
    this.bindIndex += binds.length;
    return this;
  }
}
