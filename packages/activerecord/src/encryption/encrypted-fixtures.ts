import type { PrependModule } from "@blazetrails/ruby-compat";
import type { ValueType } from "@blazetrails/activemodel";
import { Encryption } from "../namespaces.js";

type FixtureRow = Record<string, unknown>;

interface EncryptedFixtureHost {
  cleanValues: Record<string, unknown>;
}

type FixtureModelClass = {
  sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined;
  encryptedAttributes?: Set<string>;
  typeForAttribute(name: string): ValueType;
} | null;

/** @internal */
function encryptFixtureData(
  this: EncryptedFixtureHost,
  fixture: FixtureRow,
  modelClass: FixtureModelClass,
): void {
  for (const attributeName of modelClass?.encryptedAttributes ?? []) {
    const cleanValue = fixture[attributeName];
    if (cleanValue != null && cleanValue !== false) {
      this.cleanValues[attributeName] = cleanValue;

      const type = modelClass!.typeForAttribute(attributeName);
      const encryptedValue = type.serialize(cleanValue);
      fixture[attributeName] = encryptedValue;
    }
  }
}

/** @internal */
function processPreservedOriginalColumns(
  this: EncryptedFixtureHost,
  fixture: FixtureRow,
  modelClass: FixtureModelClass,
): void {
  for (const attributeName of modelClass?.encryptedAttributes ?? []) {
    const sourceAttributeName = modelClass!.sourceAttributeFromPreservedAttribute(attributeName);
    if (sourceAttributeName !== undefined) {
      const cleanValue = this.cleanValues[sourceAttributeName];
      const type = modelClass!.typeForAttribute(attributeName);
      const encryptedValue = type.serialize(cleanValue);
      fixture[attributeName] = encryptedValue;
    }
  }
}

export const EncryptedFixtures: PrependModule = {
  initialize(super_: (...args: unknown[]) => unknown, ...args: never[]): unknown {
    const [fixture, modelClass] = args as unknown as [FixtureRow, FixtureModelClass];
    if (Encryption.Configurable.config.encryptFixtures) {
      const host = this as unknown as EncryptedFixtureHost;
      host.cleanValues = {};
      encryptFixtureData.call(host, fixture, modelClass);
      processPreservedOriginalColumns.call(host, fixture, modelClass);
    }
    return super_(fixture, modelClass);
  },
};
