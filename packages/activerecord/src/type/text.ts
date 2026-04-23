/**
 * Mirrors: ActiveRecord::Type::Text
 */
import { StringType } from "@blazetrails/activemodel";

export class Text extends (StringType as new () => Omit<StringType, "name" | "type"> & {
  name: string;
  type(): string;
}) {
  readonly name = "text";

  /** Mirrors: ActiveRecord::Type::Text#type */
  type(): string {
    return "text";
  }
}
