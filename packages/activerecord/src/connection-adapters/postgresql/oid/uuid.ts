import { ValueType } from "@blazetrails/activemodel";

export const ACCEPTABLE_UUID = /^(?:\{([a-fA-F0-9]{4}-?){8}\}|([a-fA-F0-9]{4}-?){8})$/;
export const CANONICAL_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export const ACCEPTABLE_UUID_REGEX =
  /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i;

export class Uuid extends ValueType<string> {
  override type(): string {
    return "uuid";
  }

  override deserialize(value: unknown): string | null {
    return this.cast(value);
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
    value = String(value);
    if (!ACCEPTABLE_UUID.test(value as string)) return null;
    return this.formatUuid(value as string);
  }

  private formatUuid(uuid: string): string {
    if (CANONICAL_UUID.test(uuid)) return uuid;
    const stripped = uuid.replace(/[{}-]/g, "").toLowerCase();
    return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
  }
}

export function isValidUuid(value: string): boolean {
  return ACCEPTABLE_UUID_REGEX.test(value.trim());
}

export function normalizeUuid(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!isValidUuid(trimmed)) return null;

  const hex = trimmed.replace(/[{}-]/g, "").toLowerCase();
  if (hex.length !== 32) return null;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
