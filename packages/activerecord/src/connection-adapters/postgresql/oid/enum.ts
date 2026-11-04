import "../../../constants.postgresql-oid-enum.generated.js";

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

ConnectionAdapters.PostgreSQL.OID.Enum = Enum;
