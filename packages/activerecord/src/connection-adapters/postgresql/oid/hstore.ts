import { ArgumentError, Mutable, ValueType } from "@blazetrails/activemodel";
import { include, isPlainObject } from "@blazetrails/activesupport";
import {
  rbEqual,
  rbObjRespondTo,
  registerConstant,
  stringInspect,
  StringScanner,
} from "@blazetrails/ruby-compat";

import { StringKeyedHashAccessor } from "../../../store.js";

const ERROR = "Invalid Hstore document: %s";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class Hstore extends ValueType {
  override type(): string {
    return "hstore";
  }

  override deserialize(value: unknown): Record<string, string | null> | null {
    if (typeof value !== "string") return value as Record<string, string | null> | null;

    const scanner = new StringScanner(value);
    const hash: Record<string, string | null> = {};

    while (!scanner.isEos()) {
      if (scanner.skip(/"/) === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
      }

      let key = scanner.scan(/^(\\[\\"]|[^\\"])*?(?=")/);
      if (key === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
      }

      if (scanner.skip(/"=>?/) === null) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
      }

      if (scanner.scan(/NULL/) !== null) {
        value = null;
      } else {
        if (scanner.skip(/"/) === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
        }

        value = scanner.scan(/^(\\[\\"]|[^\\"])*?(?=")/);
        if (value === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
        }

        if (scanner.skip(/"/) === null) {
          throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
        }
      }

      key = key.replaceAll('\\"', '"');
      key = key.replaceAll("\\\\", "\\");

      if (value !== null) {
        value = (value as string).replaceAll('\\"', '"');
        value = (value as string).replaceAll("\\\\", "\\");
      }

      hash[key] = value as string | null;

      if (!(scanner.skip(/, /) !== null || scanner.isEos())) {
        throw new ArgumentError(ERROR.replace("%s", stringInspect(scanner.string)));
      }
    }

    return hash;
  }

  override serialize(value: unknown): unknown {
    if (isPlainObject(value)) {
      return Object.entries(value)
        .map(([k, v]) => `${escapeHstore(k)}=>${escapeHstore(v as string | null)}`)
        .join(", ");
    } else if (rbObjRespondTo(value, "toUnsafeH")) {
      return this.serialize((value as { toUnsafeH(): unknown }).toUnsafeH());
    } else {
      return value;
    }
  }

  accessor(): typeof StringKeyedHashAccessor {
    return StringKeyedHashAccessor;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return !rbEqual(this.deserialize(rawOldValue), newValue);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge carries `include ActiveModel::Type::Helpers::Mutable`'s members onto the class; it declares none of its own.
export interface Hstore extends Mutable {}

include(Hstore, Mutable);

/** @internal */
function escapeHstore(value: string | null | undefined): string {
  if (value == null) {
    return "NULL";
  } else {
    if (value === "") {
      return '""';
    } else {
      return `"${String(value).replace(/(["\\])/g, "\\$1")}"`;
    }
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Hstore", Hstore);
