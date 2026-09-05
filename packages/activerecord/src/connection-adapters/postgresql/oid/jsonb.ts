import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override type(): string {
    return "jsonb";
  }
}
