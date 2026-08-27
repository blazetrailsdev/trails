import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";

export class BindParam extends Node {
  readonly value: unknown;

  constructor(value?: unknown) {
    super();
    this.value = value;
  }

  hash(): number {
    return rbHash([this.constructor, this.value]);
  }

  eql(other: unknown): boolean {
    return other instanceof BindParam && rbEqual(this.value, other.value);
  }

  isNil(): boolean {
    if (this.value === null) return true;
    const v = this.value as { isNil?: () => boolean } | undefined;
    return typeof v?.isNil === "function" && v.isNil();
  }

  valueBeforeTypeCast(): unknown {
    const v = this.value as { valueBeforeTypeCast?: () => unknown } | null | undefined;
    return typeof v?.valueBeforeTypeCast === "function" ? v.valueBeforeTypeCast() : this.value;
  }

  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    const v = this.value as { isInfinite?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isInfinite === "function" ? v.isInfinite() : false;
  }

  isUnboundable(): 1 | -1 | false {
    const v = this.value as { isUnboundable?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isUnboundable === "function" ? v.isUnboundable() : false;
  }
}
