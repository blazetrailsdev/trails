/**
 * PostgreSQL inet type — IP address with optional subnet mask.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Inet.
 * Rails: `class Inet < Cidr`, only overrides `type` to return :inet.
 */

import { Cidr } from "./cidr.js";

export class Inet extends Cidr {
  override readonly name = "inet";

  override type(): string {
    return "inet";
  }
}
