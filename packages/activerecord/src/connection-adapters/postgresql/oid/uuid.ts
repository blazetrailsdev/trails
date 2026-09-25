import { ValueType } from "@blazetrails/activemodel";
import { rbInspect } from "@blazetrails/ruby-compat";

export const ACCEPTABLE_UUID = /^(?:\{([a-fA-F0-9]{4}-?){8}\}|([a-fA-F0-9]{4}-?){8})$/;
export const CANONICAL_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export class Uuid extends ValueType<string> {
  override type(): string {
    return "uuid";
  }

  override serialize(value: unknown): string | null {
    return this.cast(value);
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    return oldValue?.constructor !== newValue?.constructor || newValue !== oldValue;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return rawOldValue?.constructor !== newValue?.constructor || newValue !== rawOldValue;
  }

  /** @internal */
  protected override castValue(value: unknown): string | null {
    value = Array.isArray(value) ? rbInspect(value) : String(value);
    if (!ACCEPTABLE_UUID.test(value as string)) return null;
    return this.formatUuid(value as string);
  }

  private formatUuid(uuid: string): string {
    if (CANONICAL_UUID.test(uuid)) return uuid;
    const stripped = uuid.replace(/[{}-]/g, "").toLowerCase();
    return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
  }
}
