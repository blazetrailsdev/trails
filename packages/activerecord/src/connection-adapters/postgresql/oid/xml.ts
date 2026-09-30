import { registerConstant } from "@blazetrails/activesupport";
import { StringType } from "@blazetrails/activemodel";

export class Xml extends StringType {
  override type(): string {
    return "xml";
  }

  override serialize(value: unknown): Data | null {
    if (value == null) return null;
    if (value instanceof Data) return value;
    const cast = this.cast(value);
    return cast == null ? null : new Data(cast);
  }
}

export class Data {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  toString(): string {
    return this.#value;
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Xml", Xml);
