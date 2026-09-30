import { registerConstant } from "@blazetrails/activesupport";
import { StringType } from "@blazetrails/activemodel";

export class SpecializedString extends StringType {
  private readonly _type: string;

  constructor(
    type: string = "string",
    options?: { precision?: number; limit?: number; scale?: number },
  ) {
    super(options);
    this._type = type;
  }

  override type(): string {
    return this._type;
  }
}

registerConstant(
  "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::SpecializedString",
  SpecializedString,
);
