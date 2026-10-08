import { registerConstant } from "@blazetrails/ruby-compat";
import { BinaryType, BinaryData } from "@blazetrails/activemodel";
import { Connection } from "../../../pg/connection.js";

export class Bytea extends BinaryType {
  override deserialize(value: unknown): unknown {
    if (value == null) return null;
    if (value instanceof BinaryData) return value.toString();
    return Connection.unescapeBytea(super.deserialize(value) as Uint8Array);
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bytea", Bytea);
