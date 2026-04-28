import { ActiveSupportJSON } from "@blazetrails/activesupport";

/**
 * Coder that serializes/deserializes values using JSON.
 * Suitable for use with ActiveRecord::Base.serialize.
 *
 * Mirrors: ActiveRecord::Coders::JSON
 */
export class JSON {
  static dump(obj: unknown): string {
    return ActiveSupportJSON.encode(obj);
  }

  static load(json: unknown): unknown {
    if (json == null || json === "") return null;
    if (typeof json !== "string") return json;
    return ActiveSupportJSON.decode(json);
  }
}
