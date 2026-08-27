import { NoMethodError } from "./attribute-assignment.js";
import {
  underscore,
  tableize,
  demodulize,
  wrap,
  included,
  classAttribute,
} from "@blazetrails/activesupport";

interface ConversionRecord {
  isPersisted(): boolean;
  respondTo(method: string): boolean;
}

export function _toPartialPath(this: ConversionHost): string {
  if (!this._cachedToPartialPath) {
    if (this.modelName != null) {
      const mn = this.modelName;
      this._cachedToPartialPath = `${mn.collection}/${mn.element}`;
    } else {
      const element = underscore(demodulize(this.name));
      const collection = tableize(this.name);
      this._cachedToPartialPath = `${collection}/${element}`;
    }
  }
  return this._cachedToPartialPath;
}

export class Conversion {
  static [included](base: object): void {
    classAttribute.call(base, "paramDelimiter", { instanceReader: false, default: "-" });
  }

  toModel(): this {
    return this;
  }

  toKey(): unknown[] | null {
    const self = this as unknown as ConversionRecord;
    const key = self.respondTo("id") ? publicSend(this, "id") : false;
    return key != null && key !== false ? wrap(key) : null;
  }

  toParam(): string | null {
    const self = this as unknown as ConversionRecord;
    if (!self.isPersisted()) return null;
    const key = this.toKey();
    if (!key) return null;
    if (!key.every((part) => part !== null && part !== undefined && part !== false)) return null;
    return key
      .map(String)
      .join((this.constructor as unknown as { paramDelimiter: string }).paramDelimiter);
  }

  toPartialPath(): string {
    return (this.constructor as unknown as ConversionHost)._toPartialPath();
  }
}

export const ClassMethods = { _toPartialPath };

interface ConversionHost {
  name: string;
  _toPartialPath(): string;
  modelName?: { collection: string; element: string };
  _cachedToPartialPath?: string;
}

function publicSend(obj: object, method: string): unknown {
  if (!(method in obj)) {
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${obj.constructor.name}`,
    );
  }
  const value = (obj as Record<string, unknown>)[method];
  return typeof value === "function" ? (value as () => unknown).call(obj) : value;
}
