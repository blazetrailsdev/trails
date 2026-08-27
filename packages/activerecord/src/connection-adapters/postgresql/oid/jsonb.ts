import { Json } from "../../../type/json.js";

export class Jsonb extends Json {
  override readonly name: string = "jsonb";

  override type(): string {
    return "jsonb";
  }
}
