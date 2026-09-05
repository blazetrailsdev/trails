import { UnsignedInteger } from "../../../type/unsigned-integer.js";

export class Oid extends UnsignedInteger {
  override type(): string {
    return "oid";
  }
}
