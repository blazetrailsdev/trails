import { rbObjRespondTo } from "@blazetrails/ruby-compat";
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
}

export function _toPartialPath(this: ConversionHost): string {
  return (this._cachedToPartialPath ||= (() => {
    if (rbObjRespondTo(this, "modelName")) {
      return `${this.modelName!.collection}/${this.modelName!.element}`;
    } else {
      const element = underscore(demodulize(this.name));
      const collection = tableize(this.name);
      return `${collection}/${element}`;
    }
  })());
}

export class Conversion {
  static [included](base: object): void {
    classAttribute.call(base, "paramDelimiter", { instanceReader: false, default: "-" });
  }

  toModel(): this {
    return this;
  }

  toKey(): unknown[] | null {
    const key = rbObjRespondTo(this, "id") && (this as unknown as { id: unknown }).id;
    return key != null && key !== false ? wrap(key) : null;
  }

  toParam(): string | null {
    let key: unknown[] | null;
    return (this as unknown as ConversionRecord).isPersisted() &&
      (key = this.toKey()) &&
      key.every((part) => part !== null && part !== undefined && part !== false)
      ? key
          .map(String)
          .join((this.constructor as unknown as { paramDelimiter: string }).paramDelimiter)
      : null;
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
