import { registerConstant } from "@blazetrails/activesupport";
import { DateTime } from "./date-time.js";

export class Timestamp extends DateTime {
  override type(): string {
    return this.realTypeUnlessAliased("timestamp");
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Timestamp", Timestamp);
