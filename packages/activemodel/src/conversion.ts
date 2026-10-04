import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import {
  underscore,
  tableize,
  demodulize,
  wrap,
  extend,
  classAttribute,
  Concern,
  Module,
  type Included,
} from "@blazetrails/activesupport";

interface ConversionRecord {
  isPersisted(): boolean;
  toKey(): unknown[] | null;
}

export const Conversion = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      classAttribute.call(this, "paramDelimiter", { instanceReader: false, default: "-" });
    },
  );

  mod.defineMethod("toModel", toModel);
  mod.defineMethod("toKey", toKey);
  mod.defineMethod("toParam", toParam);
  mod.defineMethod("toPartialPath", toPartialPath);
}) as Module<{
  toModel: typeof toModel;
  toKey: typeof toKey;
  toParam: typeof toParam;
  toPartialPath: typeof toPartialPath;
}> & {
  ClassMethods: typeof ClassMethods;
};
export type Conversion = Included<typeof Conversion>;

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

export const ClassMethods = { _toPartialPath };
Conversion.ClassMethods = ClassMethods;

interface ConversionHost {
  name: string;
  _toPartialPath(): string;
  modelName?: { collection: string; element: string };
  _cachedToPartialPath?: string;
}
