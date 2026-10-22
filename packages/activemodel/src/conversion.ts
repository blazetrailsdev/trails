import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import {
  underscore,
  tableize,
  demodulize,
  wrap,
  extend,
  classAttribute,
  Concern,
} from "@blazetrails/activesupport";

interface ConversionRecord {
  isPersisted(): boolean;
  toKey(): unknown[] | null;
}

export interface Conversion {
  toModel<T>(this: T): T;
  toKey(): unknown[] | null;
  toParam(): string | null;
  toPartialPath(): string;
}

export function toModel<T>(this: T): T {
  return this;
}

export function toKey(this: object): unknown[] | null {
  const key = rbObjRespondTo(this, "id") && (this as unknown as { id: unknown }).id;
  return key != null && key !== false ? wrap(key) : null;
}

export function toParam(this: ConversionRecord): string | null {
  let key: unknown[] | null;
  return this.isPersisted() &&
    (key = this.toKey()) &&
    key.every((part) => part !== null && part !== undefined && part !== false)
    ? key
        .map(String)
        .join((this.constructor as unknown as { paramDelimiter: string }).paramDelimiter)
    : null;
}

export function toPartialPath(this: object): string {
  return (this.constructor as unknown as ConversionHost)._toPartialPath();
}

export function _toPartialPath(this: ConversionHost): string {
  return (
    (Object.hasOwn(this, "_cachedToPartialPath") && this._cachedToPartialPath) ||
    (this._cachedToPartialPath = (() => {
      if (rbObjRespondTo(this, "modelName")) {
        return `${this.modelName!.collection}/${this.modelName!.element}`;
      } else {
        const element = underscore(demodulize(this.name));
        const collection = tableize(this.name);
        return `${collection}/${element}`;
      }
    })())
  );
}

export const ClassMethods = { _toPartialPath };
export const Conversion = { toModel, toKey, toParam, toPartialPath, ClassMethods };
extend(Conversion, Concern);
(Conversion as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    classAttribute.call(this, "paramDelimiter", { instanceReader: false, default: "-" });
  },
);

interface ConversionHost {
  name: string;
  _toPartialPath(): string;
  modelName?: { collection: string; element: string };
  _cachedToPartialPath?: string;
}
