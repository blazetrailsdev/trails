/**
 * Mirrors: ActiveRecord::Type::Text
 */
import { StringType } from "@blazetrails/activemodel";

export class Text extends StringType {
  override readonly name: string = "text";

  /** Mirrors: ActiveRecord::Type::Text#type */
  override type(): string {
    return "text";
  }
}
