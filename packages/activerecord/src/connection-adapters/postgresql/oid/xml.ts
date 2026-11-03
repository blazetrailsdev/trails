import "../../../constants.postgresql-oid-xml.generated.js";
import { ConnectionAdapters } from "../../../namespaces.js";
import { rtest } from "@blazetrails/ruby-compat";
import { StringType } from "@blazetrails/activemodel";

export class Xml extends StringType {
  override type(): string {
    return "xml";
  }

  override serialize(value: unknown): Data | null {
    if (!rtest(value)) return null;
    return new Data(super.serialize(value) as string);
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

ConnectionAdapters.PostgreSQL.OID.Xml = Xml;
