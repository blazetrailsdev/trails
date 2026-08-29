import {
  type AttributeSet,
  Model,
  MissingAttributeError,
  AttrNames,
  AttributeMethods,
} from "@blazetrails/activemodel";
import { included, type CodeGenerator } from "@blazetrails/activesupport";
import { completeHalfAccessor } from "./read.js";

export interface Write {
  writeAttribute(name: string, value: unknown): void;
  _writeAttribute(name: string, value: unknown): void;
}

interface WriteIncludeHost {
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
}

export const Write = {
  [included](base: WriteIncludeHost): void {
    base.attributeMethodSuffix("=", { parameters: "value" });
  },
};

type WriteRecord = Model & Write & { _attributes: AttributeSet };

export function writeAttribute(this: WriteRecord, attrName: string, value: unknown): void {
  let name = (
    this.constructor as unknown as { resolveAttributeName(n: string): string }
  ).resolveAttributeName(String(attrName));

  const pk = (this.constructor as unknown as { primaryKey: string | string[] | null }).primaryKey;
  if (name === "id" && pk != null) {
    if (typeof pk === "string") {
      name = pk;
    } else if (!this._initializingAttributes) {
      const arrayName = `[${pk.map((c) => `"${c}"`).join(", ")}]`;
      throw new MissingAttributeError(`can't write unknown attribute \`${arrayName}\``);
    }
  }

  this._attributes.writeFromUser(name, value);
}

export function _writeAttribute(this: WriteRecord, attrName: string, value: unknown): void {
  this._attributes.writeFromUser(attrName, value);
}

/** @internal */
export function setDefineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName, {
    writer: true,
  });
  const tempMethodName = AttributeMethods.ClassMethods.buildMangledName(methodName);
  completeHalfAccessor(this, as, "set", function (this: WriteRecord, value: unknown) {
    this._writeAttribute(canonicalName, value);
  });
  owner.defineCachedMethod(
    tempMethodName,
    { namespace: "active_record", as: `${as}=` },
    (batch) => {
      batch.push((mod) => {
        Object.defineProperty(mod, tempMethodName, {
          value: function (this: WriteRecord, value: unknown) {
            this._writeAttribute(canonicalName, value);
          },
          writable: true,
          configurable: true,
        });
      });
    },
  );
}
