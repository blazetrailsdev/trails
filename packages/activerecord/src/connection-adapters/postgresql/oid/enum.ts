import { ValueType } from "@blazetrails/activemodel";

export class Enum extends ValueType<string> {
  override type(): string {
    return "enum";
  }

  /** @internal */
  protected override castValue(value: unknown): string {
    return String(value);
  }
}
