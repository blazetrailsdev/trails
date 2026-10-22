import { Concern, classAttribute, extend, filterMap, underscore } from "@blazetrails/activesupport";
import {
  Set,
  defineModule,
  rbModAttrReader,
  rbModAttrWriter,
  rbModConstSet,
  rbObjIvarGet,
  rbObjRespondTo,
  toS,
} from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

interface IdentificationClass {
  prototype: object;
  identifiers: Set<string>;
}

export class ClassMethods {
  static identifiedBy(this: IdentificationClass, ...identifiers: string[]): void {
    for (const identifier of identifiers) {
      rbModAttrReader(this, identifier);
      rbModAttrWriter(this, identifier);
    }
    this.identifiers = this.identifiers.union(identifiers);
  }
}

interface IdentificationConnection {
  identifiers: Set<string>;
  _connectionIdentifier?: string;
  connectionGid(ids: unknown[]): string;
}

/** @internal */
function connectionGid(ids: unknown[]): string {
  return ids
    .map((o) => {
      if (rbObjRespondTo(o, "toGidParam")) {
        return (o as { toGidParam(): string }).toGidParam();
      } else {
        return toS(o);
      }
    })
    .sort()
    .join(":");
}

export const Identification = defineModule(
  {
    get connectionIdentifier(): string {
      const self = this as unknown as IdentificationConnection;
      if (!Object.hasOwn(self, "_connectionIdentifier")) {
        self._connectionIdentifier = self.connectionGid(
          filterMap([...self.identifiers], (id) => rbObjIvarGet(self, `@${underscore(id)}`)),
        );
      }

      return self._connectionIdentifier!;
    },
  },
  {},
  { connectionGid },
);
extend(Identification, Concern);
Object.defineProperty(Identification, "ClassMethods", { value: ClassMethods });

(
  Identification as unknown as {
    included(base: null, block: (this: IdentificationClass) => void): void;
  }
).included(null, function (this: IdentificationClass) {
  classAttribute.call(this, "identifiers", { default: new Set() });
});

rbModConstSet(Connection, "Identification", Identification);
