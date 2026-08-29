import { StringType } from "@blazetrails/activemodel";

export class Text extends StringType {
  override readonly name: string = "text";

  override type(): string {
    return "text";
  }
}
