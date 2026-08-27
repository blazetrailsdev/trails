import { UnsignedInteger } from "../../../type/unsigned-integer.js";

export class Oid extends UnsignedInteger {
  override readonly name: string = "oid";

  override type(): string {
    return "oid";
  }
}
