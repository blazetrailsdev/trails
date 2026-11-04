import { ActiveRecord } from "../namespaces.js";
import { ActiveSupportJSON, isBlank } from "@blazetrails/activesupport";

export class JSON {
  static dump(obj: unknown): string {
    return ActiveSupportJSON.encode(obj);
  }

  static load(json: unknown): unknown {
    return isBlank(json) ? null : ActiveSupportJSON.decode(json as string | Uint8Array);
  }
}

ActiveRecord.Coders.JSON = JSON;
