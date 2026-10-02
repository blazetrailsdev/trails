import { Nodes } from "../namespaces.js";
import { rbModConstSet, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";

export class BindParam extends Node {
  readonly value: unknown;

  constructor(value: unknown) {
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
    const value = this.value as { isNil(): boolean } | null | undefined;
    return value == null || (rbObjRespondTo(value, "isNil") && value.isNil());
  }

  valueBeforeTypeCast(): unknown {
    const v = this.value as { valueBeforeTypeCast?: () => unknown } | null | undefined;
    return typeof v?.valueBeforeTypeCast === "function" ? v.valueBeforeTypeCast() : this.value;
  }

  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    const value = this.value as { isInfinite(): 1 | -1 | false };
    return rbObjRespondTo(value, "isInfinite") && value.isInfinite();
  }

  isUnboundable(): 1 | -1 | false {
    const value = this.value as { isUnboundable(): 1 | -1 | false };
    return rbObjRespondTo(value, "isUnboundable") && value.isUnboundable();
  }
}

rbModConstSet(Nodes, "BindParam", BindParam);
