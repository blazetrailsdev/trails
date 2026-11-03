import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../../../namespaces.js";
import { StringType } from "@blazetrails/activemodel";

export class SpecializedString extends StringType {
  private readonly _type: string;

  override type(): string {
    return this._type;
  }

  constructor(
    type: string = "string",
    options?: { precision?: number; limit?: number; scale?: number },
  ) {
    super(options);
    this._type = type;
  }
}

constSet(ConnectionAdapters.PostgreSQL.OID, "SpecializedString", SpecializedString);
