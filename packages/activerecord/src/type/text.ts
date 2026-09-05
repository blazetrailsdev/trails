import { StringType } from "@blazetrails/activemodel";

export class Text extends StringType {
  override type(): string {
    return "text";
  }
}
