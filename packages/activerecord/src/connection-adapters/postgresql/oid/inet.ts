import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override readonly name = "inet";

  override type(): string {
    return "inet";
  }
}
