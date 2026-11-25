import {
  type AttributeSet,
  Model,
  AttrNames,
  completeHalfAccessor,
} from "@blazetrails/activemodel";
import { included, type CodeGenerator } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";
import { AttributeMethods as AttributeMethodsNamespace } from "../namespaces.js";

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

type WriteRecord = Model &
  Write & { _attributes: AttributeSet; _primaryKey?: string | string[] | null };

export function writeAttribute(this: WriteRecord, attrName: string, value: unknown): void {
  let name = String(attrName);
  name =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      name
    ] ?? name;

  if (name === "id" && rtest(this._primaryKey)) name = this._primaryKey as string;
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
  completeHalfAccessor(this, as, "set", function (this: WriteRecord, value: unknown) {
    this._writeAttribute(canonicalName, value);
  });
  AttrNames.defineAttributeAccessorMethod(
    owner,
    canonicalName,
    { writer: true },
    (tempMethodName) => {
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
    },
  );
}

AttributeMethodsNamespace.Write = Write;
