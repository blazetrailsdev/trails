import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { ValueType } from "@blazetrails/activemodel";

export class Enum extends ValueType<string> {
  override type(): string {
    return "enum";
  }

  /** @internal */
  protected override castValue(value: unknown): string {
    return String(value);
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "Enum", Enum);
