import { registerConstant } from "@blazetrails/activesupport";
import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override type(): string {
    return "inet";
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Inet", Inet);
