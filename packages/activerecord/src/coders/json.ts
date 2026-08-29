import { ActiveSupportJSON } from "@blazetrails/activesupport";

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
