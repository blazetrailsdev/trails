import { ValueType } from "@blazetrails/activemodel";

export class Enum extends ValueType<string> {
  readonly name: string = "enum";

  override type(): string {
    return "enum";
  }

  /** @internal */
  protected override castValue(value: unknown): string {
    return String(value);
  }
}
