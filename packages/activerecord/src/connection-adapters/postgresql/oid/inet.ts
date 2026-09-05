import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override type(): string {
    return "inet";
  }
}
