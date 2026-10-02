import { Nodes } from "../namespaces.js";
import { isNil, rbFSend, rbModConstSet, rbObjRespondTo } from "@blazetrails/ruby-compat";
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
    return isNil(this.value);
  }

  valueBeforeTypeCast(): unknown {
    const v = this.value as { valueBeforeTypeCast?: () => unknown } | null | undefined;
    return typeof v?.valueBeforeTypeCast === "function" ? v.valueBeforeTypeCast() : this.value;
  }

  isInfinite(): 1 | -1 | null | false {
    return (
      rbObjRespondTo(this.value, "isInfinite") &&
      (rbFSend(this.value, "isInfinite") as 1 | -1 | null)
    );
  }

  isUnboundable(): 1 | -1 | false {
    const value = this.value as { isUnboundable(): 1 | -1 | false };
    return rbObjRespondTo(value, "isUnboundable") && value.isUnboundable();
  }
}

rbModConstSet(Nodes, "BindParam", BindParam);
