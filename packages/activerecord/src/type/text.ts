/**
 * Mirrors: ActiveRecord::Type::Text
 */
import { StringType } from "@blazetrails/activemodel";

export class Text extends (StringType as new () => Omit<StringType, "name"> & { name: string }) {
  readonly name = "text";
}
