import { ValueType } from "@blazetrails/activemodel";
import { ArgumentError, IPAddr, rbEql } from "@blazetrails/ruby-compat";

export class Cidr extends ValueType<IPAddr> {
  override type(): string {
    return "cidr";
  }

  override typeCastForSchema(value: unknown): string {
    const ip = value as IPAddr;
    if (ip.prefix === 32) {
      return `"${ip}"`;
    } else {
      return `"${ip}/${ip.prefix}"`;
    }
  }

  override serialize(value: unknown): unknown {
    if (value instanceof IPAddr) {
      return `${value}/${value.prefix}`;
    } else {
      return value;
    }
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    return (
      !rbEql(oldValue, newValue) ||
      (oldValue != null && (oldValue as IPAddr).prefix !== (newValue as IPAddr).prefix)
    );
  }

  castValue(value: unknown): IPAddr | null {
    if (value == null) {
      return null;
    } else if (typeof value === "string") {
      try {
        return new IPAddr(value);
      } catch (e) {
        if (e instanceof ArgumentError) return null;
        throw e;
      }
    } else {
      return value as IPAddr;
    }
  }
}
